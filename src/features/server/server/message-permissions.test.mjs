import assert from "node:assert/strict";
import test from "node:test";

import {
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
  assert.equal(canPinServerMessage("OWNER"), true);
  assert.equal(canPinServerMessage("MEMBER"), false);
});
