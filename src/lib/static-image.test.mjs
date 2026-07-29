import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeStaticImageDataUrl,
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
  formData.set("icon", new File([new Uint8Array(70_000)], "icon.png"));
  const request = new Request("http://localhost/upload", {
    body: formData,
    method: "POST",
  });

  await assert.rejects(readLimitedUploadFormData(request, 1), /大きすぎ/);
});

test("stored static images decode without accepting arbitrary data URLs", () => {
  const decoded = decodeStaticImageDataUrl(
    "data:image/png;base64,iVBORw0KGgo=",
  );

  assert.equal(decoded?.contentType, "image/png");
  assert.equal(decodeStaticImageDataUrl("data:text/html;base64,PGgxPg=="), null);
});
