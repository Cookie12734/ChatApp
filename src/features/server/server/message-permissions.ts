type ServerMemberRole = "MEMBER" | "OWNER";

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
  return role === "OWNER";
}
