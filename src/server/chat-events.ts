import type { PrismaClient } from "../../generated/prisma";

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

type ChatEventStreamState = {
  isPolling: boolean;
  lastEventId?: bigint;
  listeners: Set<ChatEventListener>;
  localEventIds: Set<string>;
  pollTimer?: NodeJS.Timeout;
};

const globalForChatEvents = globalThis as unknown as {
  chatEventStreamState?: ChatEventStreamState;
};
const streamState = (globalForChatEvents.chatEventStreamState ??= {
  isPolling: false,
  listeners: new Set(),
  localEventIds: new Set(),
});

let nextCleanupAt = 0;

export function getChatEventRecord(event: ChatEvent) {
  return {
    audienceIds: event.kind === "server" ? [] : [...event.userIds],
    kind: event.kind,
    payload: event,
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

function emitChatEvent(event: ChatEvent) {
  for (const listener of streamState.listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("Failed to deliver chat event", error);
    }
  }
}

async function pollChatEvents(db: ChatEventDatabase) {
  if (streamState.isPolling || streamState.listeners.size === 0) return;
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

    let hasMoreEvents = true;
    while (hasMoreEvents) {
      const events: Array<{ id: bigint; payload: unknown }> =
        await db.chatEvent.findMany({
          where: { id: { gt: streamState.lastEventId } },
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
  listener: ChatEventListener,
) {
  streamState.listeners.add(listener);
  if (!streamState.pollTimer) {
    void pollChatEvents(db);
    streamState.pollTimer = setInterval(() => void pollChatEvents(db), 500);
  }

  return () => {
    streamState.listeners.delete(listener);
    if (streamState.listeners.size > 0) return;

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
      },
      select: { id: true },
    });
    if (streamState.listeners.size > 0) {
      streamState.localEventIds.add(createdEvent.id.toString());
    }
    void cleanupExpiredEvents(db);
  } catch (error) {
    console.error("Failed to publish chat event", error);
  }
}
