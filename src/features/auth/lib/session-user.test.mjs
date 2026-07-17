import assert from "node:assert/strict";
import test from "node:test";

import { hasActiveSessionUser } from "./session-user.ts";

test("a session without a user ID is rejected without querying the database", async () => {
  let lookupCount = 0;

  const isActive = await hasActiveSessionUser(undefined, async () => {
    lookupCount += 1;
    return { id: "unexpected" };
  });

  assert.equal(isActive, false);
  assert.equal(lookupCount, 0);
});

test("a session is active only while its user still exists", async () => {
  const lookedUpUserIds = [];
  const findUserById = async (userId) => {
    lookedUpUserIds.push(userId);
    return userId === "active-user" ? { id: userId } : null;
  };

  assert.equal(await hasActiveSessionUser("active-user", findUserById), true);
  assert.equal(await hasActiveSessionUser("deleted-user", findUserById), false);
  assert.deepEqual(lookedUpUserIds, ["active-user", "deleted-user"]);
});
