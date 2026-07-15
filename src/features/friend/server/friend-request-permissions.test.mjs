import assert from "node:assert/strict";
import test from "node:test";

import { canCancelFriendRequest } from "./friend-request-permissions.ts";

test("only the sender can cancel a pending friend request", () => {
  assert.equal(
    canCancelFriendRequest("sender", {
      senderId: "sender",
      status: "PENDING",
    }),
    true,
  );
  assert.equal(
    canCancelFriendRequest("receiver", {
      senderId: "sender",
      status: "PENDING",
    }),
    false,
  );
  assert.equal(
    canCancelFriendRequest("sender", {
      senderId: "sender",
      status: "ACCEPTED",
    }),
    false,
  );
  assert.equal(canCancelFriendRequest("sender", null), false);
});
