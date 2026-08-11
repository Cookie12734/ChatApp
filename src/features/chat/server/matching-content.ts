export const MATCHING_TOPIC_VECTOR_SIZE = 256;

type MatchingConversationDecision = {
  createdAt: Date;
  firstUserConversationConsent: boolean | null;
  firstUserId: string;
  secondUserConversationConsent: boolean | null;
  secondUserId: string;
};

export function getConsentedConversationWindows(
  results: MatchingConversationDecision[],
  userId: string,
) {
  const sortedResults = [...results].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );

  return sortedResults.flatMap((result, index) => {
    const isFirstUser = result.firstUserId === userId;
    const isSecondUser = result.secondUserId === userId;
    if (!isFirstUser && !isSecondUser) return [];

    const consent = isFirstUser
      ? result.firstUserConversationConsent
      : result.secondUserConversationConsent;
    if (consent !== true) return [];

    const peerId = isFirstUser ? result.secondUserId : result.firstUserId;
    const nextResult = sortedResults.slice(index + 1).find((candidate) => {
      if (
        candidate.firstUserId !== userId &&
        candidate.secondUserId !== userId
      ) {
        return false;
      }
      const candidatePeerId =
        candidate.firstUserId === userId
          ? candidate.secondUserId
          : candidate.firstUserId;
      return candidatePeerId === peerId;
    });

    return [
      {
        createdAt: {
          gte: result.createdAt,
          ...(nextResult ? { lt: nextResult.createdAt } : {}),
        },
        receiverId: peerId,
      },
    ];
  });
}

function hashFeature(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getSafeTokens(content: string) {
  return (
    content
      .normalize("NFKC")
      .toLocaleLowerCase("ja-JP")
      .replace(/https?:\/\/\S+|www\.\S+/giu, " ")
      .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, " ")
      .replace(/\+?\d[\d\s().-]{7,}\d/gu, " ")
      .replace(/\p{N}+/gu, " ")
      .match(/[\p{L}]+/gu) ?? []
  );
}

export function createMatchingTopicVector(contents: string[]) {
  const vector = Array<number>(MATCHING_TOPIC_VECTOR_SIZE).fill(0);

  for (const content of contents) {
    for (const token of getSafeTokens(content)) {
      const characters = Array.from(token);
      const features: string[] = [];

      if (characters.length <= 16) features.push(`w:${token}`);
      for (const size of [2, 3]) {
        for (let index = 0; index <= characters.length - size; index += 1) {
          features.push(`c:${characters.slice(index, index + size).join("")}`);
        }
      }

      for (const feature of features) {
        const hash = hashFeature(feature);
        const bucket = hash % MATCHING_TOPIC_VECTOR_SIZE;
        vector[bucket] = (vector[bucket] ?? 0) + (hash & 1 ? -1 : 1);
      }
    }
  }

  const weighted = vector.map(
    (value) => Math.sign(value) * Math.log1p(Math.abs(value)),
  );
  const magnitude = Math.hypot(...weighted);
  if (magnitude === 0) return null;

  return weighted.map((value) => Number((value / magnitude).toFixed(6)));
}
