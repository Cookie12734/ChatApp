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

export function isServerOwner(serverOwnerId: string, userId: string) {
  return serverOwnerId === userId;
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
