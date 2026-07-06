export function canManageDirectMessage({
  currentUserId,
  isBlocked,
  isFriend,
  senderId,
}: {
  currentUserId: string;
  isBlocked: boolean;
  isFriend: boolean;
  senderId: string;
}) {
  return currentUserId === senderId && isFriend && !isBlocked;
}
