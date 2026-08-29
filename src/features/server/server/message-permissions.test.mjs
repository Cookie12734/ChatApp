import assert from "node:assert/strict";
import test from "node:test";

import {
  SERVER_PERMISSIONS,
  SERVER_ROLES,
  canDeleteServerMessage,
  canEditMessage,
  canEditServerMessage,
  canManageServer,
  canManageServerChannels,
  canManageServerInvites,
  canManageServerMember,
  canChangeServerMemberRole,
  canRemoveServerMember,
  canManageServerMembers,
  canManageServerOwnership,
  canManageServerReports,
  canPinServerMessage,
  canReactToServerMessage,
  canSearchServerMessages,
  canSendServerMessage,
  canViewServer,
  hasServerPermission,
  isServerOwner,
} from "./message-permissions.ts";

const expectedPermissions = {
  OWNER: SERVER_PERMISSIONS,
  ADMIN: [
    "view",
    "search",
    "sendMessages",
    "addReactions",
    "manageSettings",
    "manageChannels",
    "manageInvites",
    "manageMembers",
    "moderateMessages",
    "manageReports",
  ],
  MODERATOR: [
    "view",
    "search",
    "sendMessages",
    "addReactions",
    "moderateMessages",
    "manageReports",
  ],
  MEMBER: ["view", "search", "sendMessages", "addReactions"],
  READ_ONLY: ["view", "search"],
};

test("server role permission matrix", () => {
  for (const role of SERVER_ROLES) {
    for (const permission of SERVER_PERMISSIONS) {
      assert.equal(
        hasServerPermission(role, permission),
        expectedPermissions[role].includes(permission),
        `${role}:${permission}`,
      );
    }
  }

  for (const permission of SERVER_PERMISSIONS) {
    assert.equal(hasServerPermission(null, permission), false);
    assert.equal(hasServerPermission(undefined, permission), false);
  }
});

test("member management respects the role hierarchy", () => {
  assert.equal(canChangeServerMemberRole("OWNER", "ADMIN", "MEMBER"), true);
  assert.equal(canChangeServerMemberRole("OWNER", "OWNER", "MEMBER"), false);
  assert.equal(canChangeServerMemberRole("ADMIN", "MEMBER", "MODERATOR"), true);
  assert.equal(canChangeServerMemberRole("ADMIN", "ADMIN", "MEMBER"), false);
  assert.equal(canChangeServerMemberRole("ADMIN", "MEMBER", "OWNER"), false);
  assert.equal(canRemoveServerMember("OWNER", "ADMIN"), true);
  assert.equal(canRemoveServerMember("ADMIN", "MODERATOR"), true);
  assert.equal(canRemoveServerMember("ADMIN", "ADMIN"), false);
});

test("named permission helpers match the role matrix", () => {
  const cases = [
    [canViewServer, ["OWNER", "ADMIN", "MODERATOR", "MEMBER", "READ_ONLY"]],
    [
      canSearchServerMessages,
      ["OWNER", "ADMIN", "MODERATOR", "MEMBER", "READ_ONLY"],
    ],
    [canSendServerMessage, ["OWNER", "ADMIN", "MODERATOR", "MEMBER"]],
    [canReactToServerMessage, ["OWNER", "ADMIN", "MODERATOR", "MEMBER"]],
    [canManageServer, ["OWNER", "ADMIN"]],
    [canManageServerChannels, ["OWNER", "ADMIN"]],
    [canManageServerInvites, ["OWNER", "ADMIN"]],
    [canManageServerMembers, ["OWNER", "ADMIN"]],
    [canManageServerReports, ["OWNER", "ADMIN", "MODERATOR"]],
    [canManageServerOwnership, ["OWNER"]],
    [canPinServerMessage, ["OWNER", "ADMIN", "MODERATOR"]],
  ];

  for (const [helper, allowedRoles] of cases) {
    for (const role of SERVER_ROLES) {
      assert.equal(
        helper(role),
        allowedRoles.includes(role),
        `${helper.name}:${role}`,
      );
    }
  }
});

test("message and member compatibility helpers enforce ownership", () => {
  const messageCases = [
    ["OWNER", true, true, true],
    ["ADMIN", true, true, true],
    ["MODERATOR", true, true, true],
    ["MEMBER", true, true, false],
    ["READ_ONLY", false, false, false],
  ];

  for (const [role, canEditOwn, canDeleteOwn, canDeleteOther] of messageCases) {
    assert.equal(canEditServerMessage("me", "me", role), canEditOwn);
    assert.equal(canDeleteServerMessage("me", "me", role), canDeleteOwn);
    assert.equal(canDeleteServerMessage("me", "other", role), canDeleteOther);
  }

  for (const role of SERVER_ROLES) {
    const canManageOthers = role === "OWNER" || role === "ADMIN";
    assert.equal(canManageServerMember(role, "me", "other"), canManageOthers);
    assert.equal(canManageServerMember(role, "me", "me"), false);
  }

  assert.equal(canEditMessage("me", "me"), true);
  assert.equal(canEditMessage("me", "other"), false);
  assert.equal(isServerOwner("owner", "owner"), true);
  assert.equal(isServerOwner("owner", "member"), false);
});
