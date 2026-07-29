import type { PrismaClient } from "@prisma/client";

export type ChatEvent =
  | { kind: "direct"; userIds: string[] }
  | {
      change: "created" | "deleted" | "updated";
      channelId: string | null;
      kind: "server";
      senderId: string;
      serverId: string;
    }
  | {
      isTyping: boolean;
      kind: "typing";
      senderId: string;
      userIds: string[];
      userName: string;
    };

type ChatEventDatabase = Pick<PrismaClient, "chatEvent">;
type ChatEventListener = (event: ChatEvent) => void;
type ChatEventSubscription = {
  listener: ChatEventListener;
  serverIds: ReadonlySet<string>;
  userId: string;
};

type ChatEventStreamState = {
  isPolling: boolean;
  lastEventId?: bigint;
  localEventIds: Set<string>;
  pollTimer?: NodeJS.Timeout;
  subscriptions: Map<ChatEventListener, ChatEventSubscription>;
};

const globalForChatEvents = globalThis as unknown as {
  chatEventStreamState?: ChatEventStreamState;
};
const streamState: ChatEventStreamState =
  (globalForChatEvents.chatEventStreamState ??= {
    isPolling: false,
    localEventIds: new Set<string>(),
    subscriptions: new Map<ChatEventListener, ChatEventSubscription>(),
  });

let nextCleanupAt = 0;

export function getChatEventRecord(event: ChatEvent) {
  return {
    audienceIds: event.kind === "server" ? [] : [...event.userIds],
    kind: event.kind,
    payload: event,
    serverId: event.kind === "server" ? event.serverId : null,
  };
}

export function canReceiveChatEvent(
  event: ChatEvent,
  userId: string,
  serverIds: ReadonlySet<string>,
) {
  return event.kind === "server"
    ? serverIds.has(event.serverId)
    : event.userIds.includes(userId);
}

export function canOpenChatEventConnection(
  currentCount: number,
  limit: number,
) {
  return currentCount < limit;
}

export function takePendingLocalEventIds(
  localEventIds: Set<string>,
  afterEventId: bigint,
  limit = 100,
) {
  const pendingIds: bigint[] = [];

  for (const id of localEventIds) {
    const eventId = BigInt(id);
    if (eventId <= afterEventId) {
      localEventIds.delete(id);
    } else if (pendingIds.length < limit) {
      pendingIds.push(eventId);
    }
  }

  return pendingIds;
}

function emitChatEvent(event: ChatEvent) {
  for (const subscription of streamState.subscriptions.values()) {
    if (
      !canReceiveChatEvent(event, subscription.userId, subscription.serverIds)
    ) {
      continue;
    }

    try {
      subscription.listener(event);
    } catch (error) {
      console.error("Failed to deliver chat event", error);
    }
  }
}

async function pollChatEvents(db: ChatEventDatabase) {
  if (streamState.isPolling || streamState.subscriptions.size === 0) return;
  streamState.isPolling = true;

  try {
    if (streamState.lastEventId === undefined) {
      streamState.lastEventId =
        (
          await db.chatEvent.findFirst({
            orderBy: { id: "desc" },
            select: { id: true },
          })
        )?.id ?? 0n;
      return;
    }

    const audienceIds = [
      ...new Set(
        [...streamState.subscriptions.values()].map(
          (subscription) => subscription.userId,
        ),
      ),
    ];
    const serverIds = [
      ...new Set(
        [...streamState.subscriptions.values()].flatMap((subscription) => [
          ...subscription.serverIds,
        ]),
      ),
    ];
    let hasMoreEvents = true;
    while (hasMoreEvents) {
      const lastEventId = streamState.lastEventId;
      if (lastEventId === undefined) break;
      const localEventIds = takePendingLocalEventIds(
        streamState.localEventIds,
        lastEventId,
      );
      const events: Array<{ id: bigint; payload: unknown }> =
        await db.chatEvent.findMany({
          where: {
            id: { gt: lastEventId },
            OR: [
              { audienceIds: { hasSome: audienceIds } },
              ...(serverIds.length > 0
                ? [{ serverId: { in: serverIds } }]
                : []),
              ...(localEventIds.length > 0
                ? [{ id: { in: localEventIds } }]
                : []),
            ],
          },
          orderBy: { id: "asc" },
          select: { id: true, payload: true },
          take: 100,
        });

      for (const event of events) {
        streamState.lastEventId = event.id;
        if (!streamState.localEventIds.delete(event.id.toString())) {
          emitChatEvent(event.payload as ChatEvent);
        }
      }
      hasMoreEvents = events.length === 100;
    }
  } catch (error) {
    console.error("Failed to poll chat events", error);
  } finally {
    streamState.isPolling = false;
  }
}

export function subscribeToChatEvents(
  db: ChatEventDatabase,
  subscription: ChatEventSubscription,
) {
  streamState.subscriptions.set(subscription.listener, subscription);
  if (!streamState.pollTimer) {
    void pollChatEvents(db);
    streamState.pollTimer = setInterval(() => void pollChatEvents(db), 500);
  }

  return () => {
    streamState.subscriptions.delete(subscription.listener);
    if (streamState.subscriptions.size > 0) return;

    clearInterval(streamState.pollTimer);
    streamState.pollTimer = undefined;
    streamState.lastEventId = undefined;
    streamState.localEventIds.clear();
  };
}

async function cleanupExpiredEvents(db: ChatEventDatabase) {
  const now = Date.now();
  if (now < nextCleanupAt) return;

  nextCleanupAt = now + 60 * 60 * 1000;
  try {
    await db.chatEvent.deleteMany({
      where: { createdAt: { lt: new Date(now - 60 * 60 * 1000) } },
    });
  } catch {
    nextCleanupAt = 0;
  }
}

export async function publishChatEvent(
  db: ChatEventDatabase,
  event: ChatEvent,
) {
  emitChatEvent(event);

  try {
    const record = getChatEventRecord(event);

    const createdEvent = await db.chatEvent.create({
      data: {
        audienceIds: record.audienceIds,
        kind: record.kind,
        payload: record.payload,
        serverId: record.serverId,
      },
      select: { id: true },
    });
    if (streamState.subscriptions.size > 0) {
      streamState.localEventIds.add(createdEvent.id.toString());
    }
    void cleanupExpiredEvents(db);
  } catch (error) {
    console.error("Failed to publish chat event", error);
  }
}
