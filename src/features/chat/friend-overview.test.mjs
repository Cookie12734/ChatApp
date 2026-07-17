import assert from "node:assert/strict";
import test from "node:test";

import {
  getLatestFriendMessage,
  sortFriendsByLatestMessage,
} from "./friend-overview.ts";

const message = (id, createdAt) => ({ id, createdAt: new Date(createdAt) });

test("getLatestFriendMessage picks the newest message in either direction", () => {
  const incoming = message("incoming", "2026-07-17T01:00:00.000Z");
  const outgoing = message("outgoing", "2026-07-17T02:00:00.000Z");

  assert.equal(getLatestFriendMessage(incoming, outgoing), outgoing);
  assert.equal(getLatestFriendMessage(incoming, undefined), incoming);
  assert.equal(getLatestFriendMessage(undefined, undefined), null);
});

test("getLatestFriendMessage resolves equal timestamps deterministically", () => {
  const createdAt = "2026-07-17T01:00:00.000Z";

  assert.equal(
    getLatestFriendMessage(message("a", createdAt), message("b", createdAt))
      ?.id,
    "b",
  );
});

test("sortFriendsByLatestMessage keeps the prior order when times match", () => {
  const createdAt = "2026-07-17T01:00:00.000Z";
  const friends = [
    { id: "no-message", lastMessage: null },
    { id: "first", lastMessage: message("a", createdAt) },
    { id: "second", lastMessage: message("b", createdAt) },
  ];

  assert.deepEqual(
    sortFriendsByLatestMessage(friends).map(({ id }) => id),
    ["first", "second", "no-message"],
  );
});
