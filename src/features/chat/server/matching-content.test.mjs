import assert from "node:assert/strict";
import test from "node:test";

import {
  createMatchingTopicVector,
  getConsentedConversationWindows,
  MATCHING_TOPIC_VECTOR_SIZE,
} from "./matching-content.ts";
import { getMatchingTopicSimilarity } from "./matching-ranking.ts";

test("matching topic vectors compare Japanese conversation content", () => {
  const games = createMatchingTopicVector([
    "マインクラフトで建築と冒険をするのが好きです",
  ]);
  const similarGames = createMatchingTopicVector([
    "マインクラフトの建築について話したいです",
  ]);
  const worries = createMatchingTopicVector([
    "仕事の悩みで最近あまり眠れません",
  ]);

  assert.equal(games?.length, MATCHING_TOPIC_VECTOR_SIZE);
  assert.ok(
    getMatchingTopicSimilarity(games, similarGames) >
      getMatchingTopicSimilarity(games, worries),
  );
});

test("identifiers alone are removed before vectorization", () => {
  assert.equal(
    createMatchingTopicVector([
      "test@example.com https://example.com 090-1234-5678",
    ]),
    null,
  );
});

test("consent covers only that match period and the participant's messages", () => {
  const firstMatch = new Date("2026-08-01T00:00:00.000Z");
  const nextMatch = new Date("2026-08-02T00:00:00.000Z");
  const windows = getConsentedConversationWindows(
    [
      {
        createdAt: firstMatch,
        firstUserConversationConsent: true,
        firstUserId: "current",
        secondUserConversationConsent: null,
        secondUserId: "peer",
      },
      {
        createdAt: nextMatch,
        firstUserConversationConsent: false,
        firstUserId: "current",
        secondUserConversationConsent: null,
        secondUserId: "peer",
      },
      {
        createdAt: firstMatch,
        firstUserConversationConsent: true,
        firstUserId: "outsider-a",
        secondUserConversationConsent: true,
        secondUserId: "outsider-b",
      },
    ],
    "current",
  );

  assert.deepEqual(windows, [
    {
      createdAt: { gte: firstMatch, lt: nextMatch },
      receiverId: "peer",
    },
  ]);
});
