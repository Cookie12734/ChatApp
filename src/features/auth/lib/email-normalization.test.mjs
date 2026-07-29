import assert from "node:assert/strict";
import test from "node:test";

import bcrypt from "bcryptjs";

import {
  getCredentialsLoginRateLimitRules,
  getEmailVerificationCommitRateLimitRules,
  getPasswordResetIdentifier,
  getPasswordResetCommitRateLimitRules,
  getPasswordResetRequestRateLimitRules,
  getSignupRateLimitRules,
  getVerificationEmailRateLimitRules,
  isBcryptPasswordSupported,
  isPasswordResetIdentifier,
  isReplaceableLegacyRegistration,
  isVerificationTokenExpired,
  matchesSupportedBcryptPassword,
} from "./credential-policy.ts";
import { normalizeEmailAddress } from "./email-normalization.ts";

test("email addresses are normalized before auth lookups", () => {
  assert.equal(
    normalizeEmailAddress(" Alice.Example+Chat@Example.COM "),
    "alice.example+chat@example.com",
  );
  assert.equal(
    normalizeEmailAddress("\tUSER@Sub.Example.JP\n"),
    "user@sub.example.jp",
  );
});

test("credential login limits cover both address and normalized email", () => {
  const rules = getCredentialsLoginRateLimitRules(
    "person@example.com",
    "203.0.113.10",
  );

  assert.deepEqual(
    rules.map(({ limit, scope, subject }) => ({ limit, scope, subject })),
    [
      {
        limit: 500,
        scope: "auth:login:global",
        subject: "credentials",
      },
      {
        limit: 20,
        scope: "auth:login:address",
        subject: "203.0.113.10",
      },
      {
        limit: 8,
        scope: "auth:login:email",
        subject: "person@example.com",
      },
    ],
  );
});

test("signup and verification include shared global abuse ceilings", () => {
  assert.deepEqual(
    getSignupRateLimitRules("person@example.com", "203.0.113.10")[0],
    {
      limit: 100,
      scope: "auth:signup:global",
      subject: "signup",
      windowMs: 60 * 60 * 1000,
    },
  );
  assert.deepEqual(
    getVerificationEmailRateLimitRules("person@example.com", "203.0.113.10")[0],
    {
      limit: 100,
      scope: "auth:verification:global",
      subject: "verification",
      windowMs: 60 * 60 * 1000,
    },
  );
});

test("password reset limits both requests and token consumption", () => {
  assert.deepEqual(
    getPasswordResetRequestRateLimitRules(
      "person@example.com",
      "203.0.113.10",
    ).map(({ limit, scope }) => ({ limit, scope })),
    [
      { limit: 100, scope: "auth:password-reset-request:global" },
      { limit: 10, scope: "auth:password-reset-request:address" },
      { limit: 3, scope: "auth:password-reset-request:email" },
    ],
  );
  assert.deepEqual(
    getPasswordResetCommitRateLimitRules("secret-token", "203.0.113.10").map(
      ({ limit, scope }) => ({ limit, scope }),
    ),
    [
      { limit: 200, scope: "auth:password-reset:global" },
      { limit: 20, scope: "auth:password-reset:address" },
      { limit: 5, scope: "auth:password-reset:token" },
    ],
  );
});

test("password reset tokens use a separate verification namespace", () => {
  const identifier = getPasswordResetIdentifier("person@example.com");

  assert.equal(identifier, "password-reset:person@example.com");
  assert.equal(isPasswordResetIdentifier(identifier), true);
  assert.equal(isPasswordResetIdentifier("person@example.com"), false);
});

test("email verification password checks have token and global ceilings", () => {
  assert.deepEqual(
    getEmailVerificationCommitRateLimitRules(
      "secret-token",
      "203.0.113.10",
    ).map(({ limit, scope }) => ({ limit, scope })),
    [
      { limit: 200, scope: "auth:verify-token:global" },
      { limit: 20, scope: "auth:verify-token:address" },
      { limit: 5, scope: "auth:verify-token:token" },
    ],
  );
});

test("bcrypt passwords that would be silently truncated are rejected", () => {
  assert.equal(isBcryptPasswordSupported("a".repeat(72)), true);
  assert.equal(isBcryptPasswordSupported("a".repeat(73)), false);
  assert.equal(isBcryptPasswordSupported("あ".repeat(24)), true);
  assert.equal(isBcryptPasswordSupported("あ".repeat(25)), false);
});

test("email confirmation requires the same supported password", async () => {
  const passwordHash = await bcrypt.hash("registered-password", 4);

  assert.equal(
    await matchesSupportedBcryptPassword(
      "registered-password",
      passwordHash,
    ),
    true,
  );
  assert.equal(
    await matchesSupportedBcryptPassword("different-password", passwordHash),
    false,
  );
  assert.equal(
    await matchesSupportedBcryptPassword("a".repeat(73), passwordHash),
    false,
  );
});

test("only inactive legacy credential registrations can be replaced", () => {
  const legacyRegistration = {
    accountCount: 0,
    emailVerified: null,
    passwordHash: "hash",
    sessionCount: 0,
  };

  assert.equal(isReplaceableLegacyRegistration(legacyRegistration), true);
  assert.equal(
    isReplaceableLegacyRegistration({
      ...legacyRegistration,
      accountCount: 1,
    }),
    false,
  );
  assert.equal(
    isReplaceableLegacyRegistration({
      ...legacyRegistration,
      emailVerified: new Date(0),
    }),
    false,
  );
  assert.equal(
    isReplaceableLegacyRegistration({
      ...legacyRegistration,
      passwordHash: null,
    }),
    false,
  );
});

test("verification tokens expire at their exact boundary", () => {
  const expires = new Date("2026-07-28T00:00:00.000Z");

  assert.equal(
    isVerificationTokenExpired(expires, new Date("2026-07-27T23:59:59.999Z")),
    false,
  );
  assert.equal(isVerificationTokenExpired(expires, expires), true);
});
