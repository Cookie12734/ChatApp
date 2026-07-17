import assert from "node:assert/strict";
import test from "node:test";

import {
  getBlockedPeerIds,
  getVisibleFriendNotificationWhere,
  isVisibleFriendNotification,
} from "./blocking.ts";

test("getBlockedPeerIds returns every blocked counterpart once", () => {
  assert.deepEqual(
    getBlockedPeerIds("me", [
      { blockerId: "me", blockedId: "a" },
      { blockerId: "b", blockedId: "me" },
      { blockerId: "me", blockedId: "a" },
    ]).sort(),
    ["a", "b"],
  );
});

test("isVisibleFriendNotification hides blocked request peers", () => {
  const blockedPeerIds = new Set(["blocked"]);

  assert.equal(
    isVisibleFriendNotification("me", blockedPeerIds, {
      friendRequest: { receiverId: "me", senderId: "blocked" },
    }),
    false,
  );
  assert.equal(
    isVisibleFriendNotification("me", blockedPeerIds, {
      friendRequest: { receiverId: "friend", senderId: "me" },
    }),
    true,
  );
  assert.equal(
    isVisibleFriendNotification("me", blockedPeerIds, {
      friendRequest: null,
    }),
    true,
  );
});

test("getVisibleFriendNotificationWhere keeps standalone notifications and excludes blocked request peers", () => {
  assert.deepEqual(getVisibleFriendNotificationWhere("me", []), {
    userId: "me",
  });
  assert.deepEqual(getVisibleFriendNotificationWhere("me", ["blocked"]), {
    userId: "me",
    OR: [
      { friendRequestId: null },
      {
        friendRequest: {
          is: {
            OR: [
              {
                senderId: "me",
                receiverId: { notIn: ["blocked"] },
              },
              {
                NOT: { senderId: "me" },
                senderId: { notIn: ["blocked"] },
              },
            ],
          },
        },
      },
    ],
  });
});
