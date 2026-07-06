import assert from "node:assert/strict";
import test from "node:test";

import { canManageDirectMessage } from "./direct-message-permissions.ts";

test("direct message mutation requires author, friendship, and no block", () => {
  assert.equal(
    canManageDirectMessage({
      currentUserId: "me",
      isBlocked: false,
      isFriend: true,
      senderId: "me",
    }),
    true,
  );
  assert.equal(
    canManageDirectMessage({
      currentUserId: "me",
      isBlocked: false,
      isFriend: true,
      senderId: "other",
    }),
    false,
  );
  assert.equal(
    canManageDirectMessage({
      currentUserId: "me",
      isBlocked: false,
      isFriend: false,
      senderId: "me",
    }),
    false,
  );
  assert.equal(
    canManageDirectMessage({
      currentUserId: "me",
      isBlocked: true,
      isFriend: true,
      senderId: "me",
    }),
    false,
  );
});
