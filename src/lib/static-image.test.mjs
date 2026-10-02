import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeStaticImageDataUrl,
  readLimitedRequestBody,
  readLimitedUploadFormData,
  readStaticImageDataUrl,
} from "./static-image.ts";

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const encoder = new TextEncoder();

function chunk(type) {
  return [0, 0, 0, 0, ...encoder.encode(type), 0, 0, 0, 0];
}

test("readStaticImageDataUrl accepts only static PNG/JPG bytes", async () => {
  const png = new File(
    [new Uint8Array([...pngSignature, ...chunk("IHDR"), ...chunk("IDAT")])],
    "icon.png",
    { type: "image/png" },
  );
  const dataUrl = await readStaticImageDataUrl(png, 1024);

  assert.match(dataUrl, /^data:image\/png;base64,/);

  await assert.rejects(
    readStaticImageDataUrl(
      new File([new Uint8Array([0x47, 0x49, 0x46])], "icon.jpg", {
        type: "image/jpeg",
      }),
      1024,
    ),
    /PNG \/ JPG/,
  );

  await assert.rejects(
    readStaticImageDataUrl(
      new File(
        [new Uint8Array([...pngSignature, ...chunk("acTL")])],
        "icon.png",
        { type: "image/png" },
      ),
      1024,
    ),
    /PNG \/ JPG/,
  );
});

test("limited upload parsing rejects a multipart body before buffering it all", async () => {
  const formData = new FormData();
  formData.set("icon", new File([new Uint8Array(100_000)], "icon.png"));
  const encoded = new Request("http://localhost/upload", {
    body: formData,
    method: "POST",
  });
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  let offset = 0;
  let cancelled = false;
  const request = new Request(encoded.url, {
    body: new ReadableStream(
      {
        pull(controller) {
          if (offset >= bytes.length) {
            controller.close();
            return;
          }
          const chunk = bytes.slice(offset, offset + 8192);
          offset += chunk.length;
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    ),
    duplex: "half",
    headers: encoded.headers,
    method: "POST",
  });

  await assert.rejects(readLimitedUploadFormData(request, 1), /大きすぎ/);
  assert.equal(cancelled, true);
  assert.ok(offset < bytes.length);
});

test("limited body parsing accepts the byte limit and empty bodies", async () => {
  assert.deepEqual(
    await readLimitedRequestBody(
      new Request("http://localhost/upload", { body: "abcd", method: "POST" }),
      4,
    ),
    encoder.encode("abcd"),
  );
  assert.deepEqual(
    await readLimitedRequestBody(new Request("http://localhost/upload"), 4),
    new Uint8Array(),
  );
});

test("limited body parsing rejects declared oversized bodies before reading", async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream(
    {
      pull(controller) {
        pulls++;
        controller.enqueue(encoder.encode("data"));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request("http://localhost/upload", {
    body,
    duplex: "half",
    headers: { "content-length": "5" },
    method: "POST",
  });
  await assert.rejects(readLimitedRequestBody(request, 4), /大きすぎ/);
  assert.equal(pulls, 0);
  assert.equal(cancelled, true);
});

for (const contentLength of [undefined, "1", "invalid"]) {
  test(`limited body parsing counts streamed bytes despite content-length ${contentLength}`, async () => {
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream(
      {
        pull(controller) {
          pulls++;
          controller.enqueue(encoder.encode("abc"));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request("http://localhost/upload", {
      body,
      duplex: "half",
      headers: contentLength ? { "content-length": contentLength } : {},
      method: "POST",
    });
    await assert.rejects(readLimitedRequestBody(request, 4), /大きすぎ/);
    assert.equal(pulls, 2);
    assert.equal(cancelled, true);
  });
}

test("limited upload parsing preserves valid multipart fields and files", async () => {
  const formData = new FormData();
  formData.set(
    "file",
    new File(["%PDF-1.7"], "document.pdf", { type: "application/pdf" }),
  );
  formData.set("url", "https://example.com");
  const parsed = await readLimitedUploadFormData(
    new Request("http://localhost/upload", { body: formData, method: "POST" }),
    1024,
  );
  assert.equal(parsed.get("url"), "https://example.com");
  const file = parsed.get("file");
  assert.ok(file instanceof File);
  assert.equal(file.name, "document.pdf");
  assert.equal(await file.text(), "%PDF-1.7");
});

test("stored static images decode without accepting arbitrary data URLs", () => {
  const decoded = decodeStaticImageDataUrl(
    "data:image/png;base64,iVBORw0KGgo=",
  );

  assert.equal(decoded?.contentType, "image/png");
  assert.equal(
    decodeStaticImageDataUrl("data:text/html;base64,PGgxPg=="),
    null,
  );
});
