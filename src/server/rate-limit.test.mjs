import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { Prisma } from "@prisma/client";
import ts from "typescript";

import {
  getCredentialsLoginRateLimitRules,
  getEmailVerificationCommitRateLimitRules,
  getPasswordResetCommitRateLimitRules,
  getPasswordResetRequestRateLimitRules,
  getSignupRateLimitRules,
  getVerificationEmailRateLimitRules,
} from "../features/auth/lib/credential-policy.ts";
import * as rateLimitPolicy from "./rate-limit-policy.ts";

const require = createRequire(import.meta.url);
const { createRateLimitKey, RateLimitExceededError } = rateLimitPolicy;

function loadRateLimiter(database) {
  const dependencies = {
    "next/headers": {},
    "@prisma/client": { Prisma },
    "~/env": { env: {} },
    "~/server/rate-limit-policy": rateLimitPolicy,
    "~/server/db": { db: database },
  };
  const { outputText } = ts.transpileModule(
    readFileSync(new URL("./rate-limit.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  );
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name] ?? require(name);
  }, exports);
  return exports.enforceRateLimits;
}

function createRateLimiter() {
  const buckets = new Map();
  const database = {
    $executeRaw: async () => 0,
    async $queryRaw(query) {
      // Replace database I/O with the same atomic count update as the UPSERT.
      const [key, resetAt] = query.values;
      const previous = buckets.get(key);
      const bucket =
        previous && previous.resetAt.getTime() > Date.now()
          ? { count: previous.count + 1, resetAt: previous.resetAt }
          : { count: 1, resetAt };
      buckets.set(key, bucket);
      return [bucket];
    },
  };
  return {
    enforceRateLimits: loadRateLimiter(database),
    getCount: (rule) =>
      buckets.get(createRateLimitKey(rule.scope, rule.subject))?.count ?? 0,
  };
}

const authPolicies = [
  ["credentials login", getCredentialsLoginRateLimitRules],
  ["signup", getSignupRateLimitRules],
  ["verification email", getVerificationEmailRateLimitRules],
  ["password reset request", getPasswordResetRequestRateLimitRules],
  ["password reset commit", getPasswordResetCommitRateLimitRules],
  ["email verification commit", getEmailVerificationCommitRateLimitRules],
];

for (const [name, getRules] of authPolicies) {
  test(`${name}: specific rejection does not consume the global ceiling`, async () => {
    const { enforceRateLimits, getCount } = createRateLimiter();
    const rules = getRules("same-subject", "203.0.113.10");
    const specificLimit = Math.min(rules[0].limit, rules[1].limit);
    const globalRule = rules.find((rule) => rule.scope.endsWith(":global"));

    for (let i = 0; i < specificLimit; i += 1) {
      await enforceRateLimits(rules);
    }
    await assert.rejects(enforceRateLimits(rules), RateLimitExceededError);
    assert.equal(getCount(globalRule), specificLimit);
    await enforceRateLimits(getRules("unrelated-subject", "203.0.113.20"));
    assert.equal(getCount(globalRule), specificLimit + 1);
  });

  test(`${name}: unknown addresses retain independent subject limits`, async () => {
    const { enforceRateLimits, getCount } = createRateLimiter();
    const rules = getRules("same-subject", "unknown");
    const subjectRule = rules.find((rule) => !rule.scope.endsWith(":global"));
    const globalRule = rules.find((rule) => rule.scope.endsWith(":global"));

    assert.equal(
      rules.some((rule) => rule.scope.endsWith(":address")),
      false,
    );
    for (let i = 0; i < subjectRule.limit; i += 1) {
      await enforceRateLimits(rules);
    }
    await assert.rejects(enforceRateLimits(rules), RateLimitExceededError);
    await enforceRateLimits(getRules("unrelated-subject", "unknown"));
    assert.equal(getCount(globalRule), subjectRule.limit + 1);
  });
}

test("501 repeated login attempts cannot prevent an unrelated login", async () => {
  const { enforceRateLimits, getCount } = createRateLimiter();
  const rules = getCredentialsLoginRateLimitRules(
    "attacker@example.invalid",
    "203.0.113.10",
  );
  let accepted = 0;
  for (let i = 0; i < 501; i += 1) {
    try {
      await enforceRateLimits(rules);
      accepted += 1;
    } catch (error) {
      assert.ok(error instanceof RateLimitExceededError);
      assert.ok(error.retryAfterSeconds >= 1);
    }
  }
  assert.equal(accepted, 8);
  await enforceRateLimits(
    getCredentialsLoginRateLimitRules(
      "unrelated@example.invalid",
      "203.0.113.20",
    ),
  );
  assert.equal(getCount(rules.at(-1)), 9);
});

test("concurrent login attempts with rotated emails stop at the address limit", async () => {
  const { enforceRateLimits, getCount } = createRateLimiter();
  const attempts = Array.from({ length: 100 }, (_, i) =>
    enforceRateLimits(
      getCredentialsLoginRateLimitRules(
        `person-${i}@example.invalid`,
        "same-ip",
      ),
    ),
  );
  const results = await Promise.allSettled(attempts);
  const rules = getCredentialsLoginRateLimitRules(
    "person@example.invalid",
    "same-ip",
  );

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    20,
  );
  for (const result of results.filter(
    (result) => result.status === "rejected",
  )) {
    assert.ok(result.reason instanceof RateLimitExceededError);
  }
  assert.equal(getCount(rules.at(-1)), 20);
});

test("concurrent login attempts with rotated addresses stop at the email limit", async () => {
  const { enforceRateLimits, getCount } = createRateLimiter();
  const results = await Promise.allSettled(
    Array.from({ length: 100 }, (_, i) =>
      enforceRateLimits(
        getCredentialsLoginRateLimitRules(
          "same@example.invalid",
          `address-${i}`,
        ),
      ),
    ),
  );
  const rules = getCredentialsLoginRateLimitRules(
    "same@example.invalid",
    "address-0",
  );

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    8,
  );
  assert.equal(getCount(rules.at(-1)), 8);
});

test("distributed concurrent login attempts still enforce the global ceiling", async () => {
  const { enforceRateLimits, getCount } = createRateLimiter();
  const results = await Promise.allSettled(
    Array.from({ length: 501 }, (_, i) =>
      enforceRateLimits(
        getCredentialsLoginRateLimitRules(
          `person-${i}@example.invalid`,
          `address-${i}`,
        ),
      ),
    ),
  );
  const rejected = results.filter((result) => result.status === "rejected");

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    500,
  );
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof RateLimitExceededError);
  assert.equal(
    getCount(
      getCredentialsLoginRateLimitRules("person@example.invalid", "unknown").at(
        -1,
      ),
    ),
    501,
  );
});

test("a database failure stops enforcement before later buckets", async () => {
  const databaseError = new Error("synthetic database failure");
  let queryCount = 0;
  const enforceRateLimits = loadRateLimiter({
    $executeRaw: async () => 0,
    $queryRaw: async () => {
      queryCount += 1;
      throw databaseError;
    },
  });

  await assert.rejects(
    enforceRateLimits(
      getCredentialsLoginRateLimitRules("person@example.invalid", "same-ip"),
    ),
    (error) => error === databaseError,
  );
  assert.equal(queryCount, 1);
});
