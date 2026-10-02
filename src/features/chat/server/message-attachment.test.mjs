import assert from "node:assert/strict";
import test from "node:test";

import {
  getMessageAttachmentFileKind,
  MAX_MESSAGE_ATTACHMENT_URL_LENGTH,
  normalizeAttachmentFileName,
  parseAttachmentUrl,
} from "./message-attachment.ts";

test("attachment validation checks magic bytes and MIME type", () => {
  assert.equal(
    getMessageAttachmentFileKind(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
    ),
    "IMAGE",
  );
  assert.equal(
    getMessageAttachmentFileKind(
      new TextEncoder().encode("%PDF-1.7"),
      "application/pdf",
    ),
    "PDF",
  );
  assert.equal(
    getMessageAttachmentFileKind(
      new TextEncoder().encode("%PDF-1.7"),
      "image/png",
    ),
    undefined,
  );
});

test("attachment names and URL cards are normalized safely", () => {
  assert.equal(normalizeAttachmentFileName("../docs/a\n.pdf"), "a-.pdf");
  assert.equal(parseAttachmentUrl("http://example.com"), undefined);
  assert.equal(
    parseAttachmentUrl("https://user:pass@example.com/a")?.href,
    "https://example.com/a",
  );
});

test("attachment URLs enforce limits before and after normalization", () => {
  const prefix = "https://example.com/";
  const atLimit =
    prefix + "a".repeat(MAX_MESSAGE_ATTACHMENT_URL_LENGTH - prefix.length);
  assert.equal(parseAttachmentUrl(atLimit)?.href, atLimit);
  assert.equal(parseAttachmentUrl(`${atLimit}a`), undefined);
  assert.equal(parseAttachmentUrl(` ${atLimit} `), undefined);

  // URL serialization percent-encodes Unicode, expanding its stored length.
  const expandingUrl = prefix + "あ".repeat(500);
  assert.ok(expandingUrl.length < MAX_MESSAGE_ATTACHMENT_URL_LENGTH);
  assert.ok(
    new URL(expandingUrl).href.length > MAX_MESSAGE_ATTACHMENT_URL_LENGTH,
  );
  assert.equal(parseAttachmentUrl(expandingUrl), undefined);
  assert.equal(
    parseAttachmentUrl("  https://example.com/a  ")?.href,
    `${prefix}a`,
  );
});
