import sharp from "sharp";

export async function createAttachmentThumbnail(data: Uint8Array) {
  try {
    return new Uint8Array(
      await sharp(data, { limitInputPixels: 32_000_000 })
        .rotate()
        .resize({
          width: 640,
          height: 480,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 75 })
        .toBuffer(),
    );
  } catch {
    // Keep the original available when an image cannot be decoded safely.
    return null;
  }
}
