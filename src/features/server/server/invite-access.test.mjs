import assert from "node:assert/strict";
import test from "node:test";

import { getAccessibleServerInviteWhere } from "./invite-access.ts";

test("invite visibility depends only on the invite code", () => {
  assert.deepEqual(getAccessibleServerInviteWhere("invite-code"), {
    inviteCode: "invite-code",
  });
});
