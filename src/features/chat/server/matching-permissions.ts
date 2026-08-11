export function canShowMatchedUser({
  isBlocked,
  isFriend,
}: {
  isBlocked: boolean;
  isFriend: boolean;
}) {
  return isFriend && !isBlocked;
}

export function hasSettledMatch<T extends { matchedUserId: string | null }>(
  queue: T | null,
): queue is T & { matchedUserId: string } {
  return Boolean(queue?.matchedUserId);
}

type MatchingRatingState = {
  firstUserId: string;
  firstUserRatedAt: Date | null;
  secondUserId: string;
  secondUserRatedAt: Date | null;
};

export function getMatchingRatingTarget(
  currentUserId: string,
  result: MatchingRatingState,
) {
  if (result.firstUserId === currentUserId) {
    return {
      isFirstUser: true,
      ratedAt: result.firstUserRatedAt,
      targetUserId: result.secondUserId,
    } as const;
  }

  if (result.secondUserId === currentUserId) {
    return {
      isFirstUser: false,
      ratedAt: result.secondUserRatedAt,
      targetUserId: result.firstUserId,
    } as const;
  }

  return null;
}

type MatchingConversationConsentState = {
  firstUserConversationConsent: boolean | null;
  firstUserId: string;
  secondUserConversationConsent: boolean | null;
  secondUserId: string;
};

export function getMatchingConversationConsentTarget(
  currentUserId: string,
  result: MatchingConversationConsentState,
) {
  if (result.firstUserId === currentUserId) {
    return {
      consent: result.firstUserConversationConsent,
      isFirstUser: true,
      targetUserId: result.secondUserId,
    } as const;
  }

  if (result.secondUserId === currentUserId) {
    return {
      consent: result.secondUserConversationConsent,
      isFirstUser: false,
      targetUserId: result.firstUserId,
    } as const;
  }

  return null;
}
