type FriendshipEdge = {
  friendId: string;
  userId: string;
};

type PendingRequestEdge = {
  receiverId: string;
  senderId: string;
};

export function getExcludedDiscoveryUserIds({
  blockedPeerIds,
  currentUserId,
  friendships,
  pendingRequests,
}: {
  blockedPeerIds: string[];
  currentUserId: string;
  friendships: FriendshipEdge[];
  pendingRequests: PendingRequestEdge[];
}) {
  const excludedUserIds = new Set([currentUserId, ...blockedPeerIds]);

  for (const friendship of friendships) {
    excludedUserIds.add(
      friendship.userId === currentUserId
        ? friendship.friendId
        : friendship.userId,
    );
  }

  for (const request of pendingRequests) {
    excludedUserIds.add(
      request.senderId === currentUserId
        ? request.receiverId
        : request.senderId,
    );
  }

  return [...excludedUserIds];
}
