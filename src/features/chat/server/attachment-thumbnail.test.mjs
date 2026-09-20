import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createAttachmentThumbnail } from "./attachment-thumbnail.ts";

test("image previews fit 640x480 and preserve the original bytes", async () => {
  const input = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: "#326655" },
  })
    .png()
    .toBuffer();
  const original = Buffer.from(input);
  const result = await createAttachmentThumbnail(input);
  assert.ok(result);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 480);
  assert.ok(result.byteLength < input.byteLength);
  assert.deepEqual(input, original);
});

test("previews do not enlarge small images and reject invalid image data", async () => {
  const input = await sharp({
    create: { width: 20, height: 10, channels: 4, background: "transparent" },
  })
    .png()
    .toBuffer();
  const result = await createAttachmentThumbnail(input);
  assert.equal((await sharp(result).metadata()).width, 20);
  assert.equal(
    await createAttachmentThumbnail(new Uint8Array([1, 2, 3])),
    null,
  );
});
