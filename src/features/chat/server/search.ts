import type { MessageKind } from "@prisma/client";

export const SEARCH_MESSAGE_KINDS = ["DIRECT", "SERVER", "GROUP"] as const;

export type SearchMessageKind = (typeof SEARCH_MESSAGE_KINDS)[number];

export type SearchMessageResult = {
  content: string;
  context: {
    channelId?: string;
    channelName?: string;
    friendId?: string;
    groupId?: string;
    groupName?: string;
    serverId?: string;
    serverName?: string;
  };
  createdAt: Date;
  id: string;
  kind: MessageKind;
  sender: {
    id: string;
    image: string;
    name: string | null;
    userId: string;
  };
};

export function sortSearchResults<T extends { createdAt: Date; id: string }>(
  results: T[],
) {
  return results.sort(
    (left, right) =>
      right.createdAt.getTime() - left.createdAt.getTime() ||
      right.id.localeCompare(left.id),
  );
}

export function isSearchResultBeforeCursor(
  result: { createdAt: Date; id: string },
  cursor: { createdAt: Date; id: string } | undefined,
) {
  if (!cursor) return true;
  const difference = result.createdAt.getTime() - cursor.createdAt.getTime();
  return difference < 0 || (difference === 0 && result.id < cursor.id);
}
