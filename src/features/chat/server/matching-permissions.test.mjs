import assert from "node:assert/strict";
import test from "node:test";

import {
  canShowMatchedUser,
  getMatchingConversationConsentTarget,
  getMatchingRatingTarget,
  hasSettledMatch,
} from "./matching-permissions.ts";

test("matched user preview requires friendship and no block", () => {
  assert.equal(canShowMatchedUser({ isBlocked: false, isFriend: true }), true);
  assert.equal(canShowMatchedUser({ isBlocked: true, isFriend: true }), false);
  assert.equal(
    canShowMatchedUser({ isBlocked: false, isFriend: false }),
    false,
  );
});

test("a settled match is preserved instead of reset to waiting", () => {
  assert.equal(
    hasSettledMatch({ matchedUserId: "matched-user", topic: "GAME" }),
    true,
  );
  assert.equal(hasSettledMatch({ matchedUserId: null, topic: "GAME" }), false);
  assert.equal(hasSettledMatch(null), false);
});

test("only a match participant can target a private rating", () => {
  const result = {
    firstUserId: "first",
    firstUserRatedAt: null,
    secondUserId: "second",
    secondUserRatedAt: new Date(),
  };

  assert.deepEqual(getMatchingRatingTarget("first", result), {
    isFirstUser: true,
    ratedAt: null,
    targetUserId: "second",
  });
  assert.equal(getMatchingRatingTarget("outsider", result), null);
});

test("conversation consent belongs only to the participant who answered", () => {
  const result = {
    firstUserConversationConsent: true,
    firstUserId: "first",
    secondUserConversationConsent: null,
    secondUserId: "second",
  };

  assert.deepEqual(getMatchingConversationConsentTarget("second", result), {
    consent: null,
    isFirstUser: false,
    targetUserId: "first",
  });
  assert.equal(getMatchingConversationConsentTarget("outsider", result), null);
});
