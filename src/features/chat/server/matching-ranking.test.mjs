import assert from "node:assert/strict";
import test from "node:test";

import {
  getPrivateMatchingWeight,
  pickMatchingCandidate,
} from "./matching-ranking.ts";

test("private ratings influence selection without excluding candidates", () => {
  const low = { matchingRatingCount: 5, matchingRatingTotal: 0 };
  const unrated = { matchingRatingCount: 0, matchingRatingTotal: 0 };
  const high = { matchingRatingCount: 5, matchingRatingTotal: 10 };

  assert.ok(getPrivateMatchingWeight(low) > 0);
  assert.ok(getPrivateMatchingWeight(low) < getPrivateMatchingWeight(unrated));
  assert.ok(getPrivateMatchingWeight(unrated) < getPrivateMatchingWeight(high));
});

test("weighted selection keeps candidates in the pool", () => {
  const candidates = [
    {
      id: "first",
      user: {
        matchingRatingCount: 5,
        matchingRatingTotal: 0,
        matchingTopicProfiles: [],
      },
    },
    {
      id: "second",
      user: {
        matchingRatingCount: 5,
        matchingRatingTotal: 10,
        matchingTopicProfiles: [],
      },
    },
  ];

  assert.equal(pickMatchingCandidate(candidates, null, () => 0)?.id, "first");
  assert.equal(
    pickMatchingCandidate(candidates, null, () => 0.999)?.id,
    "second",
  );
  assert.equal(
    pickMatchingCandidate([], null, () => 0),
    undefined,
  );
});

test("conversation similarity increases the internal matching weight", () => {
  const rating = { matchingRatingCount: 0, matchingRatingTotal: 0 };

  assert.ok(
    getPrivateMatchingWeight(rating, 0.8) >
      getPrivateMatchingWeight(rating, 0.2),
  );
});
