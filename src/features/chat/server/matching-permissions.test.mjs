import assert from "node:assert/strict";
import test from "node:test";

import { canShowMatchedUser, hasSettledMatch } from "./matching-permissions.ts";

test("matched user preview requires friendship and no block", () => {
  assert.equal(canShowMatchedUser({ isBlocked: false, isFriend: true }), true);
  assert.equal(canShowMatchedUser({ isBlocked: true, isFriend: true }), false);
  assert.equal(
    canShowMatchedUser({ isBlocked: false, isFriend: false }),
    false,
  );
});

test("a settled match is preserved instead of reset to waiting", () => {
  assert.equal(
    hasSettledMatch({ matchedUserId: "matched-user", topic: "GAME" }),
    true,
  );
  assert.equal(hasSettledMatch({ matchedUserId: null, topic: "GAME" }), false);
  assert.equal(hasSettledMatch(null), false);
});
