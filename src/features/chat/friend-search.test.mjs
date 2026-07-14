import assert from "node:assert/strict";
import test from "node:test";

import { matchesFriendSearch } from "./friend-search.ts";

test("friend search matches display name and user ID", () => {
  const friend = { name: "Connect User", userId: "connect_123" };

  assert.equal(matchesFriendSearch(friend, " user "), true);
  assert.equal(matchesFriendSearch(friend, "NECT_1"), true);
  assert.equal(matchesFriendSearch(friend, "missing"), false);
  assert.equal(matchesFriendSearch(friend, "  "), true);
});
