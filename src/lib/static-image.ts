const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function isJpeg(buffer: Buffer) {
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isPng(buffer: Buffer) {
  return pngSignature.every((byte, index) => buffer[index] === byte);
}

function isAnimatedPng(buffer: Buffer) {
  let offset: number = pngSignature.length;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);

    if (type === "acTL") return true;
    if (type === "IDAT") return false;

    const nextOffset = offset + 12 + length;
    if (nextOffset <= offset || nextOffset > buffer.length) return false;

    offset = nextOffset;
  }

  return false;
}

export async function readStaticImageDataUrl(file: File, maxFileSize: number) {
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    throw new Error("PNG / JPG の静止画像を選択してください");
  }

  if (file.size === 0) {
    throw new Error("空のファイルはアップロードできません");
  }

  if (file.size > maxFileSize) {
    throw new Error(`画像は${maxFileSize / 1024 / 1024}MB以内にしてください`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isValid =
    file.type === "image/jpeg"
      ? isJpeg(buffer)
      : isPng(buffer) && !isAnimatedPng(buffer);

  if (!isValid) {
    throw new Error("PNG / JPG の静止画像を選択してください");
  }

  return `data:${file.type};base64,${buffer.toString("base64")}`;
}
