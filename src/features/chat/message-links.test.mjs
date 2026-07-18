import assert from "node:assert/strict";
import test from "node:test";

import { splitMessageLinks } from "./message-links.ts";

test("message links include only valid HTTP and HTTPS URLs", () => {
  assert.deepEqual(
    splitMessageLinks(
      "Docs: https://example.com/docs. Search: HTTP://example.org?q=chat!",
    ),
    [
      { kind: "text", value: "Docs: " },
      { kind: "link", value: "https://example.com/docs" },
      { kind: "text", value: ". Search: " },
      { kind: "link", value: "HTTP://example.org?q=chat" },
      { kind: "text", value: "!" },
    ],
  );

  assert.deepEqual(splitMessageLinks("javascript:alert(1) http://"), [
    { kind: "text", value: "javascript:alert(1) http://" },
  ]);
});
