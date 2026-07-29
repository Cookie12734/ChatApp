import assert from "node:assert/strict";
import test from "node:test";

import {
  canCancelFriendRequest,
  getFriendRequestLockIds,
  getPendingFriendRequestWhere,
} from "./friend-request-permissions.ts";

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

test("friend, block, message, and matching mutations share one lock order", () => {
  assert.deepEqual(getFriendRequestLockIds("user-b", "user-a"), [
    "user-a",
    "user-b",
  ]);
  assert.deepEqual(
    getFriendRequestLockIds("user-a", "user-b"),
    getFriendRequestLockIds("user-b", "user-a"),
  );
});

test("request transitions claim only a pending request for its receiver", () => {
  assert.deepEqual(getPendingFriendRequestWhere("request", "receiver"), {
    id: "request",
    receiverId: "receiver",
    status: "PENDING",
  });
});
