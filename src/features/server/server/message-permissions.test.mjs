import assert from "node:assert/strict";
import test from "node:test";

import {
  canJoinServerByInvite,
  countServerOwners,
  getVisibleServerMembers,
  canManageServer,
  canManageServerMember,
  canDeleteServerMessage,
  canEditMessage,
  canPinServerMessage,
  shouldDeleteServerOnLeave,
} from "./message-permissions.ts";

test("server message permissions match owner and author rules", () => {
  assert.equal(canEditMessage("me", "me"), true);
  assert.equal(canEditMessage("me", "other"), false);
  assert.equal(canDeleteServerMessage("me", "other", "OWNER"), true);
  assert.equal(canDeleteServerMessage("me", "me", "MEMBER"), true);
  assert.equal(canDeleteServerMessage("me", "other", "MEMBER"), false);
  assert.equal(canManageServer("OWNER"), true);
  assert.equal(canManageServer("MEMBER"), false);
  assert.equal(canManageServerMember("OWNER", "me", "other"), true);
  assert.equal(canManageServerMember("OWNER", "me", "me"), false);
  assert.equal(canManageServerMember("MEMBER", "me", "other"), false);
  assert.equal(shouldDeleteServerOnLeave("OWNER", 1), true);
  assert.equal(shouldDeleteServerOnLeave("OWNER", 2), false);
  assert.equal(shouldDeleteServerOnLeave("MEMBER", 1), false);
  assert.equal(
    canJoinServerByInvite({ hasBlockedMember: false, isMember: false }),
    true,
  );
  assert.equal(
    canJoinServerByInvite({ hasBlockedMember: true, isMember: false }),
    false,
  );
  assert.equal(
    canJoinServerByInvite({ hasBlockedMember: true, isMember: true }),
    true,
  );
  assert.equal(
    countServerOwners([
      { role: "OWNER" },
      { role: "MEMBER" },
      { role: "OWNER" },
    ]),
    2,
  );
  assert.deepEqual(
    getVisibleServerMembers(
      [{ userId: "me" }, { userId: "blocked" }],
      ["blocked"],
    ),
    [{ userId: "me" }],
  );
  assert.equal(canPinServerMessage("OWNER"), true);
  assert.equal(canPinServerMessage("MEMBER"), false);
});
