export type FriendMessagePreview = {
  createdAt: Date;
  id: string;
};

export function getLatestFriendMessage<T extends FriendMessagePreview>(
  incoming: T | undefined,
  outgoing: T | undefined,
) {
  if (!incoming) return outgoing ?? null;
  if (!outgoing) return incoming;

  const createdAtDifference =
    incoming.createdAt.getTime() - outgoing.createdAt.getTime();

  if (createdAtDifference !== 0) {
    return createdAtDifference > 0 ? incoming : outgoing;
  }

  return incoming.id > outgoing.id ? incoming : outgoing;
}

export function sortFriendsByLatestMessage<
  T extends { lastMessage: FriendMessagePreview | null },
>(friends: T[]) {
  return friends
    .map((friend, index) => ({ friend, index }))
    .sort((a, b) => {
      const aTime = a.friend.lastMessage?.createdAt.getTime() ?? 0;
      const bTime = b.friend.lastMessage?.createdAt.getTime() ?? 0;

      return bTime - aTime || a.index - b.index;
    })
    .map(({ friend }) => friend);
}
