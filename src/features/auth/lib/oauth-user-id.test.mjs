import assert from "node:assert/strict";
import test from "node:test";

import {
  getOAuthUserIdCandidate,
  withOAuthUserIdSuffix,
} from "./oauth-user-id.ts";

test("OAuth user IDs are safe and bounded", () => {
  assert.equal(getOAuthUserIdCandidate("Alice.Example"), "aliceexample");
  assert.equal(getOAuthUserIdCandidate("あ"), "user");
  assert.equal(getOAuthUserIdCandidate("a".repeat(40)).length, 32);
  assert.equal(
    withOAuthUserIdSuffix("aliceexample", "ABC-123"),
    "aliceexample_abc123",
  );
  assert.equal(withOAuthUserIdSuffix("a".repeat(32), "123456").length, 32);
});
