import assert from "node:assert/strict";
import test from "node:test";

import {
  getMessageAttachmentFileKind,
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
