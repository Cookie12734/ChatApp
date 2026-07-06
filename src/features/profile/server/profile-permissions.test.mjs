import assert from "node:assert/strict";
import test from "node:test";

import { canViewProfile } from "./profile-permissions.ts";

test("profile visibility requires a relationship and no block", () => {
  assert.equal(
    canViewProfile({ isBlocked: false, isFriend: true, sharesServer: false }),
    true,
  );
  assert.equal(
    canViewProfile({ isBlocked: false, isFriend: false, sharesServer: true }),
    true,
  );
  assert.equal(
    canViewProfile({ isBlocked: false, isFriend: false, sharesServer: false }),
    false,
  );
  assert.equal(
    canViewProfile({ isBlocked: true, isFriend: true, sharesServer: true }),
    false,
  );
});
