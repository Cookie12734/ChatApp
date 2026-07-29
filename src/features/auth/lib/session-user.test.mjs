import assert from "node:assert/strict";
import test from "node:test";

import { getActiveSessionUser } from "./session-user.ts";

test("a session without a user ID is rejected without querying the database", async () => {
  let lookupCount = 0;

  const activeUser = await getActiveSessionUser(undefined, 0, async () => {
    lookupCount += 1;
    return { id: "unexpected", sessionVersion: 0, userId: "unexpected" };
  });

  assert.equal(activeUser, null);
  assert.equal(lookupCount, 0);
});

test("a session is active only while its user and version still match", async () => {
  const lookedUpUserIds = [];
  const findUserById = async (userId) => {
    lookedUpUserIds.push(userId);
    return userId === "active-user"
      ? { id: userId, sessionVersion: 0, userId: "public-id" }
      : null;
  };

  assert.deepEqual(
    await getActiveSessionUser("active-user", undefined, findUserById),
    { id: "active-user", sessionVersion: 0, userId: "public-id" },
  );
  assert.equal(
    await getActiveSessionUser("active-user", 1, findUserById),
    null,
  );
  assert.equal(
    await getActiveSessionUser("deleted-user", 0, findUserById),
    null,
  );
  assert.deepEqual(lookedUpUserIds, [
    "active-user",
    "active-user",
    "deleted-user",
  ]);
});
