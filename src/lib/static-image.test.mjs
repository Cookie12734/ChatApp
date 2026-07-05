import assert from "node:assert/strict";
import test from "node:test";

import { readStaticImageDataUrl } from "./static-image.ts";

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
