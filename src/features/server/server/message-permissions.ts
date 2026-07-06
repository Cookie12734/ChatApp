type ServerMemberRole = "MEMBER" | "OWNER";

export function canManageServer(role: ServerMemberRole | null | undefined) {
  return role === "OWNER";
}

export function canManageServerMember(
  role: ServerMemberRole | null | undefined,
  currentUserId: string,
  memberUserId: string,
) {
  return canManageServer(role) && currentUserId !== memberUserId;
}

export function shouldDeleteServerOnLeave(
  role: ServerMemberRole,
  ownerCount: number,
) {
  return canManageServer(role) && ownerCount <= 1;
}

export function canJoinServerByInvite({
  hasBlockedMember,
  isMember,
}: {
  hasBlockedMember: boolean;
  isMember: boolean;
}) {
  return isMember || !hasBlockedMember;
}

export function countServerOwners<T extends { role: ServerMemberRole }>(
  members: T[],
) {
  return members.filter((member) => member.role === "OWNER").length;
}

export function getVisibleServerMembers<T extends { userId: string }>(
  members: T[],
  hiddenUserIds: string[],
) {
  return members.filter((member) => !hiddenUserIds.includes(member.userId));
}

export function canEditMessage(currentUserId: string, senderId: string) {
  return currentUserId === senderId;
}

export function canDeleteServerMessage(
  currentUserId: string,
  senderId: string,
  role: ServerMemberRole,
) {
  return role === "OWNER" || canEditMessage(currentUserId, senderId);
}

export function canPinServerMessage(role: ServerMemberRole) {
  return canManageServer(role);
}
