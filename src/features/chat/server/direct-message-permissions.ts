export function canManageDirectMessage({
  currentUserId,
  senderId,
}: {
  currentUserId: string;
  senderId: string;
}) {
  return currentUserId === senderId;
}
