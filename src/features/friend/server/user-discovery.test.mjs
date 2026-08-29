import assert from "node:assert/strict";
import test from "node:test";

import { getExcludedDiscoveryUserIds } from "./user-discovery.ts";

test("discovery excludes self, blocked peers, friends, and pending peers", () => {
  const excluded = getExcludedDiscoveryUserIds({
    blockedPeerIds: ["blocked-by-me", "blocked-me"],
    currentUserId: "me",
    friendships: [
      { userId: "me", friendId: "friend-a" },
      { userId: "friend-b", friendId: "me" },
    ],
    pendingRequests: [
      { senderId: "me", receiverId: "outgoing" },
      { senderId: "incoming", receiverId: "me" },
    ],
  });

  assert.deepEqual(excluded.sort(), [
    "blocked-by-me",
    "blocked-me",
    "friend-a",
    "friend-b",
    "incoming",
    "me",
    "outgoing",
  ]);
});

test("discovery leaves unrelated users eligible", () => {
  const excluded = getExcludedDiscoveryUserIds({
    blockedPeerIds: [],
    currentUserId: "me",
    friendships: [],
    pendingRequests: [],
  });

  assert.deepEqual(excluded, ["me"]);
  assert.equal(excluded.includes("candidate"), false);
});
