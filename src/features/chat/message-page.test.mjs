import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeMessageCursor,
  getMessageCursorWhere,
  prepareMessagePage,
} from "./message-page.ts";

test("message pages use a stable boundary cursor", () => {
  const newest = new Date("2026-01-03T00:00:00.000Z");
  const middle = new Date("2026-01-02T00:00:00.000Z");
  const oldest = new Date("2026-01-01T00:00:00.000Z");
  const page = prepareMessagePage(
    [
      { createdAt: newest, id: "new" },
      { createdAt: middle, id: "middle" },
      { createdAt: oldest, id: "old" },
    ],
    2,
  );

  assert.deepEqual(
    page.messages.map(({ id }) => id),
    ["middle", "new"],
  );
  assert.deepEqual(decodeMessageCursor(page.nextCursor), {
    createdAt: middle,
    id: "middle",
  });
  assert.deepEqual(
    getMessageCursorWhere(decodeMessageCursor(page.nextCursor)),
    {
      OR: [
        { createdAt: { lt: middle } },
        { createdAt: middle, id: { lt: "middle" } },
      ],
    },
  );
  assert.deepEqual(prepareMessagePage([{ createdAt: newest, id: "only" }], 2), {
    messages: [{ createdAt: newest, id: "only" }],
    nextCursor: undefined,
  });
  assert.equal(decodeMessageCursor("v1::message"), undefined);
  assert.equal(decodeMessageCursor("v1:9007199254740991:message"), undefined);
});
