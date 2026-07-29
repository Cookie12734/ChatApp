const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const multipartOverheadAllowance = 64 * 1024;

export class UploadTooLargeError extends Error {
  constructor() {
    super("アップロードが大きすぎます");
    this.name = "UploadTooLargeError";
  }
}

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

export async function readLimitedUploadFormData(
  request: Request,
  maxFileSize: number,
) {
  const maxBodySize = maxFileSize + multipartOverheadAllowance;
  const contentLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > maxBodySize) {
    throw new UploadTooLargeError();
  }
  if (!request.body) return request.formData();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    size += value.byteLength;
    if (size > maxBodySize) {
      throw new UploadTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Request(request.url, {
    body,
    headers: request.headers,
    method: request.method,
  }).formData();
}

export function decodeStaticImageDataUrl(value: string) {
  const match =
    /^data:(image\/(?:jpeg|png));base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value);
  if (!match?.[1] || !match[2]) return null;

  return {
    bytes: Buffer.from(match[2], "base64"),
    contentType: match[1],
  };
}

export function getProfileImageUrl(userId: string) {
  return `/api/profile/icon/${encodeURIComponent(userId)}`;
}

export function addProfileImageUrl<T extends { userId: string }>(user: T) {
  return { ...user, image: getProfileImageUrl(user.userId) };
}

export function getServerImageUrl(serverId: string, inviteCode?: string) {
  const path = `/api/servers/${encodeURIComponent(serverId)}/icon`;
  return inviteCode
    ? `${path}?inviteCode=${encodeURIComponent(inviteCode)}`
    : path;
}

export function createFallbackAvatarSvg(label: string) {
  const initial = [...label.trim()][0]?.toUpperCase() ?? "?";
  const escapedInitial = initial
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#114744"/><text x="64" y="70" fill="#f6f0e4" font-family="system-ui,sans-serif" font-size="54" font-weight="600" text-anchor="middle" dominant-baseline="middle">${escapedInitial}</text></svg>`;
}
