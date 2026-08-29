export const SERVER_ROLES = [
  "OWNER",
  "ADMIN",
  "MODERATOR",
  "MEMBER",
  "READ_ONLY",
] as const;

export type ServerMemberRole = (typeof SERVER_ROLES)[number];

export const SERVER_PERMISSIONS = [
  "view",
  "search",
  "sendMessages",
  "addReactions",
  "manageSettings",
  "manageChannels",
  "manageInvites",
  "manageMembers",
  "moderateMessages",
  "manageReports",
  "manageOwnership",
] as const;

export type ServerPermission = (typeof SERVER_PERMISSIONS)[number];

const readOnlyPermissions: readonly ServerPermission[] = ["view", "search"];
const memberPermissions: readonly ServerPermission[] = [
  ...readOnlyPermissions,
  "sendMessages",
  "addReactions",
];
const moderatorPermissions: readonly ServerPermission[] = [
  ...memberPermissions,
  "moderateMessages",
  "manageReports",
];
const adminPermissions: readonly ServerPermission[] = [
  ...moderatorPermissions,
  "manageSettings",
  "manageChannels",
  "manageInvites",
  "manageMembers",
];

const permissionsByRole: Record<
  ServerMemberRole,
  ReadonlySet<ServerPermission>
> = {
  OWNER: new Set(SERVER_PERMISSIONS),
  ADMIN: new Set(adminPermissions),
  MODERATOR: new Set(moderatorPermissions),
  MEMBER: new Set(memberPermissions),
  READ_ONLY: new Set(readOnlyPermissions),
};

export function hasServerPermission(
  role: ServerMemberRole | null | undefined,
  permission: ServerPermission,
) {
  return role ? permissionsByRole[role].has(permission) : false;
}

export function canViewServer(role: ServerMemberRole | null | undefined) {
  return hasServerPermission(role, "view");
}

export function canSearchServerMessages(
  role: ServerMemberRole | null | undefined,
) {
  return hasServerPermission(role, "search");
}

export function canSendServerMessage(
  role: ServerMemberRole | null | undefined,
) {
  return hasServerPermission(role, "sendMessages");
}

export function canReactToServerMessage(
  role: ServerMemberRole | null | undefined,
) {
  return hasServerPermission(role, "addReactions");
}

export function canManageServer(role: ServerMemberRole | null | undefined) {
  return hasServerPermission(role, "manageSettings");
}

export function canManageServerChannels(
  role: ServerMemberRole | null | undefined,
) {
  return hasServerPermission(role, "manageChannels");
}

export function canManageServerInvites(
  role: ServerMemberRole | null | undefined,
) {
  return hasServerPermission(role, "manageInvites");
}

export function canManageServerMembers(
  role: ServerMemberRole | null | undefined,
) {
  return hasServerPermission(role, "manageMembers");
}

export function canManageServerReports(
  role: ServerMemberRole | null | undefined,
) {
  return hasServerPermission(role, "manageReports");
}

export function canManageServerOwnership(
  role: ServerMemberRole | null | undefined,
) {
  return hasServerPermission(role, "manageOwnership");
}

export function canManageServerMember(
  role: ServerMemberRole | null | undefined,
  currentUserId: string,
  memberUserId: string,
) {
  return canManageServerMembers(role) && currentUserId !== memberUserId;
}

export function canChangeServerMemberRole(
  actorRole: ServerMemberRole | null | undefined,
  targetRole: ServerMemberRole,
  nextRole: ServerMemberRole,
) {
  if (actorRole === "OWNER") return targetRole !== "OWNER";
  const adminAssignableRoles: readonly ServerMemberRole[] = [
    "MODERATOR",
    "MEMBER",
    "READ_ONLY",
  ];
  return (
    actorRole === "ADMIN" &&
    adminAssignableRoles.includes(targetRole) &&
    adminAssignableRoles.includes(nextRole)
  );
}

export function canRemoveServerMember(
  actorRole: ServerMemberRole | null | undefined,
  targetRole: ServerMemberRole,
) {
  return actorRole === "OWNER"
    ? targetRole !== "OWNER"
    : actorRole === "ADMIN" && targetRole !== "OWNER" && targetRole !== "ADMIN";
}

export function isServerOwner(serverOwnerId: string, userId: string) {
  return serverOwnerId === userId;
}

export function canEditMessage(currentUserId: string, senderId: string) {
  return currentUserId === senderId;
}

export function canEditServerMessage(
  currentUserId: string,
  senderId: string,
  role: ServerMemberRole | null | undefined,
) {
  return canSendServerMessage(role) && canEditMessage(currentUserId, senderId);
}

export function canDeleteServerMessage(
  currentUserId: string,
  senderId: string,
  role: ServerMemberRole | null | undefined,
) {
  return (
    hasServerPermission(role, "moderateMessages") ||
    canEditServerMessage(currentUserId, senderId, role)
  );
}

export function canPinServerMessage(role: ServerMemberRole | null | undefined) {
  return hasServerPermission(role, "moderateMessages");
}
