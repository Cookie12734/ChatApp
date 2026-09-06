import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as policy from "./notification-policy.ts";

test("push runs after the response and handles delivery failures", async (t) => {
  const callbacks = [];
  const errors = [];
  const deliveries = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  const dependencies = {
    "next/server": { after: (callback) => callbacks.push(callback) },
    "~/env": {
      env: {
        VAPID_SUBJECT: "mailto:test@example.com",
        VAPID_PUBLIC_KEY: "test-public",
        VAPID_PRIVATE_KEY: "test-private",
      },
    },
    "~/features/notification/server/notification-policy": policy,
    "web-push": {
      default: {
        sendNotification: async (_subscription, payload) =>
          deliveries.push(JSON.parse(payload)),
      },
    },
  };
  // Load the real implementation with only its environment and I/O replaced.
  const { outputText } = ts.transpileModule(
    readFileSync(new URL("./push.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  );
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  let settingsReads = 0;
  const database = {
    notificationPreference: {
      findUnique: async () => {
        settingsReads++;
        return null;
      },
    },
    pushSubscription: {
      findMany: async () => [
        {
          id: "device",
          endpoint: "https://example.com",
          auth: "a",
          p256dh: "p",
        },
      ],
      update: async () => {},
    },
  };
  const input = {
    kind: "DIRECT_MESSAGE",
    recipientId: "recipient",
    body: "private message",
  };
  exports.schedulePushNotification(database, input);
  assert.equal(settingsReads, 0);
  assert.equal(deliveries.length, 0);
  await callbacks.shift()();
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].body, "新しいメッセージがあります");

  database.notificationPreference.findUnique = async () => {
    throw new Error("database unavailable");
  };
  exports.schedulePushNotification(database, input);
  await assert.doesNotReject(callbacks.shift());
  assert.equal(errors.length, 1);
});
