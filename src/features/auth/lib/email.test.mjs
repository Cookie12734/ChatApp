import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTransport } from "nodemailer";
import ts from "typescript";

const recipient = "person@example.invalid";
const sender = "connect@example.invalid";
const baseUrl = "https://connect.example.invalid";
const token = "synthetic-token";
const emailSenders = [
  ["sendSignupVerificationEmail", "/auth/verify-email"],
  ["sendPasswordResetEmail", "/auth/reset-password"],
];

function loadEmail(transport) {
  const dependencies = {
    nodemailer: {
      createTransport: (server) => {
        assert.equal(server, "smtp://synthetic-server.invalid");
        return transport;
      },
    },
    "~/env": {
      env: {
        EMAIL_SERVER: "smtp://synthetic-server.invalid",
        EMAIL_FROM: sender,
        NODE_ENV: "production",
      },
    },
    "~/features/auth/lib/email-url": { getEmailBaseUrl: () => baseUrl },
  };
  const { outputText } = ts.transpileModule(
    readFileSync(new URL("./email.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  );
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

for (const [sendMethod, path] of emailSenders) {
  test(`${sendMethod}: accepted delivery allows an omitted pending list`, async () => {
    const calls = [];
    let sentMessage;
    const email = loadEmail({
      async verify() {
        await Promise.resolve();
        calls.push("verified");
        return true;
      },
      async sendMail(message) {
        calls.push("sent");
        sentMessage = message;
        return { accepted: [recipient], rejected: [] };
      },
    });

    await email[sendMethod](recipient, token);

    assert.deepEqual(calls, ["verified", "sent"]);
    assert.equal(sentMessage.to, recipient);
    assert.equal(sentMessage.from, sender);
    assert.ok(sentMessage.text.includes(`${baseUrl}${path}?token=${token}`));
    assert.ok(sentMessage.html.includes(`${baseUrl}${path}?token=${token}`));
  });

  for (const [name, result, expectedError] of [
    [
      "rejected recipient",
      { accepted: [recipient], rejected: ["rejected@example.invalid"] },
      /rejected@example\.invalid/,
    ],
    [
      "pending recipient",
      { accepted: [recipient], rejected: [], pending: [recipient] },
      /person@example\.invalid/,
    ],
    [
      "empty accepted list",
      { accepted: [], rejected: [] },
      /accepted recipient is empty/,
    ],
  ]) {
    test(`${sendMethod}: ${name} remains a delivery failure`, async () => {
      const email = loadEmail({
        verify: async () => true,
        sendMail: async () => result,
      });

      await assert.rejects(email[sendMethod](recipient, token), expectedError);
    });
  }

  test(`${sendMethod}: installed Nodemailer builds the email in memory`, async () => {
    const transport = createTransport({ streamTransport: true, buffer: true });
    let generatedMessage;
    const email = loadEmail({
      verify: async () => true,
      async sendMail(message) {
        generatedMessage = await transport.sendMail(message);
        // Stream transport renders MIME; only SMTP delivery metadata is mocked.
        return { accepted: generatedMessage.envelope.to, rejected: [] };
      },
    });

    await email[sendMethod](recipient, token);

    assert.deepEqual(generatedMessage.envelope.to, [recipient]);
    assert.equal(generatedMessage.envelope.from, sender);
    assert.ok(Buffer.isBuffer(generatedMessage.message));
    const mime = generatedMessage.message.toString("utf8");
    assert.match(mime, /MIME-Version: 1\.0/);
    assert.match(mime, /multipart\/alternative/);
    assert.ok(mime.includes(path));
    assert.ok(mime.includes(token));
  });
}
