import assert from "node:assert/strict";
import test from "node:test";

import { canManageDirectMessage } from "./direct-message-permissions.ts";

test("direct message mutation requires only the original author", () => {
  assert.equal(
    canManageDirectMessage({
      currentUserId: "me",
      senderId: "me",
    }),
    true,
  );
  assert.equal(
    canManageDirectMessage({
      currentUserId: "me",
      senderId: "other",
    }),
    false,
  );
});
