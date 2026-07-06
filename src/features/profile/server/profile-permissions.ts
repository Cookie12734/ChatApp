export function canViewProfile({
  isBlocked,
  isFriend,
  sharesServer,
}: {
  isBlocked: boolean;
  isFriend: boolean;
  sharesServer: boolean;
}) {
  return !isBlocked && (isFriend || sharesServer);
}
