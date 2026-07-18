import assert from "node:assert/strict";
import test from "node:test";

import { shouldGroupMessage } from "./message-grouping.ts";

test("consecutive messages from the same sender group for ten minutes", () => {
  const previous = {
    createdAt: new Date("2026-07-18T00:00:00.000Z"),
    senderId: "user-a",
  };

  assert.equal(
    shouldGroupMessage(
      { createdAt: new Date("2026-07-18T00:10:00.000Z"), senderId: "user-a" },
      previous,
    ),
    true,
  );
  assert.equal(
    shouldGroupMessage(
      { createdAt: new Date("2026-07-18T00:10:00.001Z"), senderId: "user-a" },
      previous,
    ),
    false,
  );
  assert.equal(
    shouldGroupMessage(
      { createdAt: new Date("2026-07-18T00:01:00.000Z"), senderId: "user-b" },
      previous,
    ),
    false,
  );
});
