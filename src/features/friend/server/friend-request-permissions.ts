type FriendRequestState = {
  senderId: string;
  status: "ACCEPTED" | "DECLINED" | "PENDING";
};

export function canCancelFriendRequest(
  currentUserId: string,
  request: FriendRequestState | null,
) {
  return request?.senderId === currentUserId && request.status === "PENDING";
}

export function getFriendRequestLockIds(userAId: string, userBId: string) {
  return [userAId, userBId].sort();
}

export function getPendingFriendRequestWhere(
  requestId: string,
  receiverId: string,
) {
  return { id: requestId, receiverId, status: "PENDING" as const };
}
