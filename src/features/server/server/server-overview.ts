type ServerChannelIdentity = {
  id: string;
  name: string;
  serverId: string;
};

type ServerUnreadGroup = {
  _count: { _all: number };
  channelId: string | null;
  serverId: string;
};

function unreadCountKey(serverId: string, channelId: string | null) {
  return JSON.stringify([serverId, channelId]);
}

export function addUnreadCountsToServerChannels<
  T extends ServerChannelIdentity,
>(channels: T[], groups: ServerUnreadGroup[]) {
  const counts = new Map<string, number>();

  for (const group of groups) {
    const key = unreadCountKey(group.serverId, group.channelId);
    counts.set(key, (counts.get(key) ?? 0) + group._count._all);
  }

  return channels.map((channel) => ({
    ...channel,
    unreadCount:
      (counts.get(unreadCountKey(channel.serverId, channel.id)) ?? 0) +
      (channel.name === "general"
        ? (counts.get(unreadCountKey(channel.serverId, null)) ?? 0)
        : 0),
  }));
}

export function getRealtimeUnreadCount(
  currentCount: number,
  event: { change: "created" | "deleted" | "updated"; isMine: boolean },
  isSelectedChannel: boolean,
) {
  if (isSelectedChannel) return 0;
  return event.change === "created" && !event.isMine
    ? currentCount + 1
    : currentCount;
}
