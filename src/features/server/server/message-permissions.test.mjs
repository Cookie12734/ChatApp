import assert from "node:assert/strict";
import test from "node:test";

import {
  isServerOwner,
  canManageServer,
  canManageServerMember,
  canDeleteServerMessage,
  canEditMessage,
  canPinServerMessage,
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
  assert.equal(isServerOwner("owner", "owner"), true);
  assert.equal(isServerOwner("owner", "member"), false);
  assert.equal(canPinServerMessage("OWNER"), true);
  assert.equal(canPinServerMessage("MEMBER"), false);
});
