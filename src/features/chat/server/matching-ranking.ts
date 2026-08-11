type RatedCandidate = {
  user: {
    matchingRatingCount: number;
    matchingRatingTotal: number;
    matchingTopicProfiles: { vector: unknown }[];
  };
};

export function getMatchingTopicSimilarity(left: unknown, right: unknown) {
  const readVector = (value: unknown) => {
    if (!Array.isArray(value) || value.length === 0 || value.length > 2048) {
      return null;
    }

    const vector: number[] = [];
    for (const item of value as unknown[]) {
      if (typeof item !== "number" || !Number.isFinite(item)) return null;
      vector.push(item);
    }
    return vector;
  };
  const leftVector = readVector(left);
  const rightVector = readVector(right);
  if (!leftVector || !rightVector) return 0;
  if (leftVector.length !== rightVector.length) return 0;

  const similarity = leftVector.reduce(
    (sum, value, index) => sum + value * (rightVector[index] ?? 0),
    0,
  );
  return Math.max(0, Math.min(1, similarity));
}

export function getPrivateMatchingWeight(
  {
    matchingRatingCount,
    matchingRatingTotal,
  }: Pick<
    RatedCandidate["user"],
    "matchingRatingCount" | "matchingRatingTotal"
  >,
  topicSimilarity = 0,
) {
  const smoothedRating = (matchingRatingTotal + 5) / (matchingRatingCount + 5);

  // Keep exploration: even the lowest-rated candidate retains half the
  // probability of a candidate with the maximum possible aggregate.
  return 1 + smoothedRating / 2 + topicSimilarity;
}

export function pickMatchingCandidate<T extends RatedCandidate>(
  candidates: T[],
  currentUserVector: unknown,
  random = Math.random,
) {
  if (candidates.length === 0) return undefined;

  const weighted = candidates.map((candidate) => ({
    candidate,
    weight: getPrivateMatchingWeight(
      candidate.user,
      getMatchingTopicSimilarity(
        currentUserVector,
        candidate.user.matchingTopicProfiles[0]?.vector,
      ),
    ),
  }));
  let cursor = random() * weighted.reduce((sum, item) => sum + item.weight, 0);

  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor < 0) return item.candidate;
  }

  return weighted.at(-1)?.candidate;
}
