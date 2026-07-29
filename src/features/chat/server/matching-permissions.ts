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
