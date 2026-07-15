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
