import { auth } from "~/features/auth";
import {
  canOpenChatEventConnection,
  canReceiveChatEvent,
  subscribeToChatEvents,
} from "~/server/chat-events";
import { db } from "~/server/db";
import { enforceRateLimits } from "~/server/rate-limit";
import { RateLimitExceededError } from "~/server/rate-limit-policy";

export const runtime = "nodejs";

const maxConnectionsPerUser = 3;
const streamLifetimeMs = 60_000;
const globalForChatStreams = globalThis as unknown as {
  chatEventConnectionCounts?: Map<string, number>;
  presenceUpdatedAt?: Map<string, number>;
};
const connectionCounts = (globalForChatStreams.chatEventConnectionCounts ??=
  new Map<string, number>());
const presenceUpdatedAt = (globalForChatStreams.presenceUpdatedAt ??= new Map<
  string,
  number
>());

function acquireConnection(userId: string) {
  const count = connectionCounts.get(userId) ?? 0;
  if (!canOpenChatEventConnection(count, maxConnectionsPerUser)) return;

  connectionCounts.set(userId, count + 1);
  return () => {
    const currentCount = connectionCounts.get(userId) ?? 1;
    if (currentCount <= 1) {
      connectionCounts.delete(userId);
      presenceUpdatedAt.delete(userId);
    } else {
      connectionCounts.set(userId, currentCount - 1);
    }
  };
}

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await enforceRateLimits([
      {
        limit: 30,
        scope: "chat:sse:user",
        subject: userId,
        windowMs: 60_000,
      },
    ]);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return new Response("Too many connections", {
        headers: { "Retry-After": String(error.retryAfterSeconds) },
        status: 429,
      });
    }
    throw error;
  }

  const releaseConnection = acquireConnection(userId);
  if (!releaseConnection) {
    return new Response("Too many open connections", {
      headers: { "Retry-After": "10" },
      status: 429,
    });
  }

  const updateLastSeen = async () => {
    const now = Date.now();
    const lastUpdate = presenceUpdatedAt.get(userId) ?? 0;
    if (now - lastUpdate < 15_000) return;
    presenceUpdatedAt.set(userId, now);

    try {
      await db.user.updateMany({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
      });
    } catch (error) {
      presenceUpdatedAt.delete(userId);
      console.error("Failed to update presence heartbeat", error);
    }
  };
  await updateLastSeen();

  const memberships = await db.serverMember
    .findMany({
      where: { userId },
      select: { serverId: true },
    })
    .catch((error) => {
      releaseConnection();
      throw error;
    });
  const serverIds = new Set(memberships.map(({ serverId }) => serverId));
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const enqueue = (value: string) => {
        if (!closed) controller.enqueue(encoder.encode(value));
      };
      const closeController = () => {
        try {
          controller.close();
        } catch {
          // The request abort and lifetime timer can finish at the same time.
        }
      };
      const unsubscribe = subscribeToChatEvents(db, {
        listener(event) {
          if (!canReceiveChatEvent(event, userId, serverIds)) return;
          enqueue(`event: chat\ndata: ${JSON.stringify(event)}\n\n`);
        },
        serverIds,
        userId,
      });
      const heartbeatTimer = setInterval(() => void updateLastSeen(), 20_000);
      const membershipTimer = setInterval(() => {
        void db.serverMember
          .findMany({
            where: { userId },
            select: { serverId: true },
          })
          .then((latestMemberships) => {
            serverIds.clear();
            for (const membership of latestMemberships) {
              serverIds.add(membership.serverId);
            }
          })
          .catch((error) => {
            console.error("Failed to refresh chat event access", error);
          });
      }, 15_000);
      const keepAlive = setInterval(() => enqueue(": keep-alive\n\n"), 25_000);
      const lifetimeTimer = setTimeout(() => {
        cleanup?.();
        closeController();
      }, streamLifetimeMs);

      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        releaseConnection();
        clearInterval(heartbeatTimer);
        clearInterval(membershipTimer);
        clearInterval(keepAlive);
        clearTimeout(lifetimeTimer);
      };
      request.signal.addEventListener(
        "abort",
        () => {
          cleanup?.();
          closeController();
        },
        { once: true },
      );
      enqueue("retry: 3000\n\n");
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
