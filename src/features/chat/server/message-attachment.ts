export const MAX_MESSAGE_ATTACHMENT_SIZE = 8 * 1024 * 1024;
export const MESSAGE_ATTACHMENT_TTL_MS = 60 * 60 * 1000;

type FileKind = "IMAGE" | "PDF";

function hasBytes(bytes: Uint8Array, expected: readonly number[]) {
  return expected.every((byte, index) => bytes[index] === byte);
}

export function getMessageAttachmentFileKind(
  bytes: Uint8Array,
  mimeType: string,
): FileKind | undefined {
  const isJpeg = hasBytes(bytes, [0xff, 0xd8, 0xff]);
  const isPng = hasBytes(
    bytes,
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  const isGif =
    new TextDecoder("ascii").decode(bytes.slice(0, 6)) === "GIF87a" ||
    new TextDecoder("ascii").decode(bytes.slice(0, 6)) === "GIF89a";
  const isWebp =
    new TextDecoder("ascii").decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder("ascii").decode(bytes.slice(8, 12)) === "WEBP";
  const isPdf = new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-";

  if (
    (mimeType === "image/jpeg" && isJpeg) ||
    (mimeType === "image/png" && isPng) ||
    (mimeType === "image/gif" && isGif) ||
    (mimeType === "image/webp" && isWebp)
  ) {
    return "IMAGE";
  }
  if (mimeType === "application/pdf" && isPdf) return "PDF";
  return undefined;
}

export function normalizeAttachmentFileName(value: string) {
  const normalized = value
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "-")
    .trim();
  return (normalized?.length ? normalized : "attachment").slice(0, 120);
}

export function parseAttachmentUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    url.username = "";
    url.password = "";
    return url;
  } catch {
    return undefined;
  }
}
