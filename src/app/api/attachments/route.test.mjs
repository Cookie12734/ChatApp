import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as attachments from "../../../features/chat/server/message-attachment.ts";
import * as staticImage from "../../../lib/static-image.ts";
import * as rateLimitPolicy from "../../../server/rate-limit-policy.ts";

function loadRoute({
  session = { user: { id: "uploader" } },
  rateLimitError,
} = {}) {
  const saved = [];
  let databaseCalls = 0;
  const dependencies = {
    "next/server": { NextResponse: { json: Response.json } },
    "~/features/auth": { auth: async () => session },
    "~/features/chat/server/attachment-thumbnail": {
      createAttachmentThumbnail: async () => null,
    },
    "~/features/chat/server/message-attachment": attachments,
    "~/lib/static-image": staticImage,
    "~/server/rate-limit": {
      enforceRateLimits: async () => {
        if (rateLimitError) throw rateLimitError;
      },
    },
    "~/server/rate-limit-policy": rateLimitPolicy,
    "~/server/db": {
      db: {
        messageAttachment: {
          deleteMany: async () => {
            databaseCalls++;
          },
          count: async () => {
            databaseCalls++;
            return 0;
          },
          create: async ({ data }) => {
            databaseCalls++;
            saved.push(data);
            return {
              id: "attachment",
              fileName: data.fileName,
              kind: data.kind,
              mimeType: data.mimeType,
              size: data.size,
            };
          },
        },
      },
    },
  };
  // Exercise the real route and body readers with only environment and I/O replaced.
  const { outputText } = ts.transpileModule(
    readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
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
  return { POST: exports.POST, saved, databaseCalls: () => databaseCalls };
}

function jsonRequest(payload, headers = {}) {
  return new Request("http://localhost/api/attachments", {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });
}

test("attachment route rejects declared oversized JSON without reading or saving it", async () => {
  const route = loadRoute();
  let pulls = 0;
  let cancelled = false;
  const response = await route.POST(
    new Request("http://localhost/api/attachments", {
      body: new ReadableStream(
        {
          pull(controller) {
            pulls++;
            controller.enqueue(new Uint8Array([1]));
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      ),
      duplex: "half",
      headers: {
        "content-type": "application/json",
        "content-length": String(
          attachments.MAX_MESSAGE_ATTACHMENT_JSON_SIZE + 1,
        ),
      },
      method: "POST",
    }),
  );
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    message: "添付データが大きすぎます",
  });
  assert.equal(pulls, 0);
  assert.equal(cancelled, true);
  assert.equal(route.databaseCalls(), 0);
});

test("attachment route rejects oversized streamed JSON with a false content-length", async () => {
  const route = loadRoute();
  const request = jsonRequest(
    {
      url: `https://example.com/${"a".repeat(attachments.MAX_MESSAGE_ATTACHMENT_JSON_SIZE)}`,
    },
    { "content-length": "1" },
  );
  const response = await route.POST(request);
  assert.equal(response.status, 413);
  assert.equal(route.databaseCalls(), 0);
});

test("attachment route accepts JSON at the byte limit and rejects malformed JSON safely", async () => {
  const route = loadRoute();
  const payload = { url: "https://example.com/", padding: "" };
  payload.padding = "a".repeat(
    attachments.MAX_MESSAGE_ATTACHMENT_JSON_SIZE -
      JSON.stringify(payload).length,
  );
  const response = await route.POST(jsonRequest(payload));
  assert.equal(response.status, 200);
  assert.equal(route.saved.length, 1);

  const malformedRoute = loadRoute();
  const malformed = await malformedRoute.POST(
    new Request("http://localhost/api/attachments", {
      body: '{"url":',
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    message: "添付ファイルを保存できませんでした",
  });
  assert.equal(malformedRoute.databaseCalls(), 0);
});

test("attachment route rejects oversized URL input and serialization for both input formats", async () => {
  for (const url of [
    `https://example.com/${"a".repeat(attachments.MAX_MESSAGE_ATTACHMENT_URL_LENGTH)}`,
    `https://example.com/${"あ".repeat(500)}`,
  ]) {
    for (const json of [true, false]) {
      const route = loadRoute();
      const formData = new FormData();
      formData.set("url", url);
      const request = json
        ? jsonRequest({ url })
        : new Request("http://localhost/api/attachments", {
            body: formData,
            method: "POST",
          });
      const response = await route.POST(request);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        message: "4096文字以内のHTTPSのURLを入力してください",
      });
      assert.equal(route.saved.length, 0);
    }
  }
});

test("attachment route accepts normal JSON links and multipart files", async () => {
  const linkRoute = loadRoute();
  const linkResponse = await linkRoute.POST(
    jsonRequest({ url: "  https://user:pass@example.com/a  " }),
  );
  assert.equal(linkResponse.status, 200);
  assert.equal(linkRoute.saved[0].externalUrl, "https://example.com/a");

  const fileRoute = loadRoute();
  const formData = new FormData();
  formData.set(
    "file",
    new File(["%PDF-1.7"], "document.pdf", { type: "application/pdf" }),
  );
  const fileResponse = await fileRoute.POST(
    new Request("http://localhost/api/attachments", {
      body: formData,
      method: "POST",
    }),
  );
  assert.equal(fileResponse.status, 200);
  assert.equal(fileRoute.saved[0].kind, "PDF");
  assert.equal(fileRoute.saved[0].size, 8);
});

test("attachment route retains the 8MB multipart file limit", async () => {
  const route = loadRoute();
  const formData = new FormData();
  formData.set(
    "file",
    new File(
      [new Uint8Array(attachments.MAX_MESSAGE_ATTACHMENT_SIZE + 1)],
      "large.pdf",
      { type: "application/pdf" },
    ),
  );
  const response = await route.POST(
    new Request("http://localhost/api/attachments", {
      body: formData,
      method: "POST",
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: "ファイルは8MB以内にしてください",
  });
  assert.equal(route.saved.length, 0);
});

test("attachment route retains authentication and rate-limit rejection", async () => {
  for (const [options, status] of [
    [{ session: null }, 401],
    [{ rateLimitError: new rateLimitPolicy.RateLimitExceededError(60) }, 429],
  ]) {
    const route = loadRoute(options);
    const response = await route.POST(
      jsonRequest({ url: "https://example.com" }),
    );
    assert.equal(response.status, status);
    assert.equal(route.databaseCalls(), 0);
  }
});
