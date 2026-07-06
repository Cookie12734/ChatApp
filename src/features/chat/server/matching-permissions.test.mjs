import assert from "node:assert/strict";
import test from "node:test";

import { canShowMatchedUser } from "./matching-permissions.ts";

test("matched user preview requires friendship and no block", () => {
  assert.equal(canShowMatchedUser({ isBlocked: false, isFriend: true }), true);
  assert.equal(canShowMatchedUser({ isBlocked: true, isFriend: true }), false);
  assert.equal(
    canShowMatchedUser({ isBlocked: false, isFriend: false }),
    false,
  );
});
