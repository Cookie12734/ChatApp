import assert from "node:assert/strict";
import test from "node:test";

import { getBlockedPeerIds } from "./blocking.ts";

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
