import assert from "node:assert/strict";
import test from "node:test";

import { getAccessibleServerInviteWhere } from "./invite-access.ts";

test("invite visibility allows existing members and excludes either block direction", () => {
  assert.deepEqual(getAccessibleServerInviteWhere("invite-code", "me"), {
    inviteCode: "invite-code",
    OR: [
      {
        members: {
          some: { userId: "me" },
        },
      },
      {
        members: {
          none: {
            user: {
              OR: [
                {
                  blockedUsers: {
                    some: { blockedId: "me" },
                  },
                },
                {
                  blockedBy: {
                    some: { blockerId: "me" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  });
});
