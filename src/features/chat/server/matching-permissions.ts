export function canShowMatchedUser({
  isBlocked,
  isFriend,
}: {
  isBlocked: boolean;
  isFriend: boolean;
}) {
  return isFriend && !isBlocked;
}
