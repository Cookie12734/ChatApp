import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { PrismaAdapter } from "@auth/prisma-adapter";
import * as jwt from "next-auth/jwt";
import ts from "typescript";

import { getActiveSessionUser } from "./lib/session-user.ts";

const require = createRequire(import.meta.url);
// Exercise the installed OAuth linking handler, with only database I/O replaced.
const { handleLoginOrRegister } = await import(
  new URL(
    "./lib/actions/callback/handle-login.js",
    pathToFileURL(require.resolve("@auth/core")),
  ).href
);

function loadConfig(database) {
  const dependencies = {
    "@auth/prisma-adapter": { PrismaAdapter },
    "next-auth": { CredentialsSignin: class extends Error {} },
    "~/env": { env: {} },
    "~/features/auth/lib/credential-policy": {},
    "~/features/auth/lib/email-normalization": {
      normalizeEmailAddress: (email) => email.toLowerCase(),
    },
    "~/features/auth/lib/email-user": {
      findUserByNormalizedEmail: async () => ({
        user: null,
        isAmbiguous: false,
      }),
    },
    "~/features/auth/lib/oauth-user-id": {
      getOAuthUserIdCandidate: (seed) => seed,
    },
    "~/features/auth/lib/session-user": { getActiveSessionUser },
    "~/lib/static-image": { getProfileImageUrl: (id) => `/icon/${id}` },
    "~/server/db": { db: database },
    "~/server/rate-limit": {},
    "~/server/rate-limit-policy": {},
  };
  const { outputText } = ts.transpileModule(
    readFileSync(new URL("./config.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  );
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    if (name.startsWith("~/")) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    }
    return dependencies[name] ?? require(name);
  }, exports);
  return exports.authConfig;
}

for (const version of [0, 1]) {
  test(`OAuth linking honors session revocation (version ${version})`, async () => {
    const victim = {
      id: "victim",
      userId: "victim",
      email: "victim@example.invalid",
      name: "Victim",
      image: null,
      emailVerified: new Date(),
      sessionVersion: 1,
    };
    const accounts = [];
    const database = {
      user: {
        findUnique: async ({ where }) =>
          where.id === victim.id ? victim : null,
        create: async ({ data }) => ({
          ...data,
          id: "new-user",
          sessionVersion: 0,
        }),
      },
      account: {
        findUnique: async () => null,
        create: async ({ data }) => {
          accounts.push(data);
          return data;
        },
      },
    };
    const config = loadConfig(database);
    const options = {
      adapter: config.adapter,
      jwt: {
        ...jwt,
        ...config.jwt,
        secret: "synthetic-test-secret",
        maxAge: 3600,
      },
      events: {},
      session: { strategy: "jwt" },
      cookies: { sessionToken: { name: "authjs.session-token" } },
      provider: { account: (tokens) => tokens },
    };
    const salt = options.cookies.sessionToken.name;
    const token = await jwt.encode({
      ...options.jwt,
      salt,
      token: { sub: victim.id, sessionVersion: version },
    });
    const decoded = await config.jwt.decode({ ...options.jwt, token, salt });
    assert.equal(decoded?.sub ?? null, version === 1 ? victim.id : null);

    const result = await handleLoginOrRegister(
      token,
      { id: "discord-user", name: "New user", email: "new@example.invalid" },
      { type: "oauth", provider: "discord", providerAccountId: "new-discord" },
      options,
    );
    assert.equal(result.user.id, version === 1 ? victim.id : "new-user");
    assert.equal(accounts[0].userId, result.user.id);
  });
}
