import assert from "node:assert/strict";
import test from "node:test";

import { prepareMessagePage } from "./message-page.ts";

test("message pages stay chronological and expose the next cursor", () => {
  assert.deepEqual(
    prepareMessagePage([{ id: "new" }, { id: "middle" }, { id: "old" }], 2),
    {
      messages: [{ id: "middle" }, { id: "new" }],
      nextCursor: "old",
    },
  );
  assert.deepEqual(prepareMessagePage([{ id: "only" }], 2), {
    messages: [{ id: "only" }],
    nextCursor: undefined,
  });
});
