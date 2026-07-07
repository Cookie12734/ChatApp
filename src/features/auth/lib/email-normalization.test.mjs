import assert from "node:assert/strict";
import test from "node:test";

import { normalizeEmailAddress } from "./email-normalization.ts";

test("email addresses are normalized before auth lookups", () => {
  assert.equal(
    normalizeEmailAddress(" Alice.Example+Chat@Example.COM "),
    "alice.example+chat@example.com",
  );
  assert.equal(
    normalizeEmailAddress("\tUSER@Sub.Example.JP\n"),
    "user@sub.example.jp",
  );
});
