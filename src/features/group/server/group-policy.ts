export const MAX_GROUP_MEMBERS = 10;

type BlockEdge = {
  blockedId: string;
  blockerId: string;
};

export type GroupInviteIssue =
  | "ALREADY_MEMBER"
  | "BLOCKED"
  | "DUPLICATE"
  | "NOT_FRIEND"
  | "TOO_MANY";

export function getGroupInviteIssue({
  blockEdges,
  candidateIds,
  existingMemberIds,
  friendIds,
}: {
  blockEdges: BlockEdge[];
  candidateIds: string[];
  existingMemberIds: string[];
  friendIds: string[];
}): GroupInviteIssue | undefined {
  const candidates = new Set(candidateIds);
  if (candidates.size !== candidateIds.length) return "DUPLICATE";

  const existingMembers = new Set(existingMemberIds);
  if (candidateIds.some((candidateId) => existingMembers.has(candidateId))) {
    return "ALREADY_MEMBER";
  }
  if (existingMembers.size + candidateIds.length > MAX_GROUP_MEMBERS) {
    return "TOO_MANY";
  }

  const friends = new Set(friendIds);
  if (candidateIds.some((candidateId) => !friends.has(candidateId))) {
    return "NOT_FRIEND";
  }

  const resultingMembers = new Set([...existingMembers, ...candidateIds]);
  if (
    blockEdges.some(
      ({ blockedId, blockerId }) =>
        resultingMembers.has(blockedId) && resultingMembers.has(blockerId),
    )
  ) {
    return "BLOCKED";
  }

  return undefined;
}

type GroupMessagePayload = {
  content: string;
  groupId: string;
  replyToId: string | null;
};

export function isSameGroupMessage(
  message: GroupMessagePayload,
  input: GroupMessagePayload,
) {
  return (
    message.content === input.content &&
    message.groupId === input.groupId &&
    message.replyToId === input.replyToId
  );
}
