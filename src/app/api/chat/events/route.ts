import { auth } from "~/features/auth";
import {
  canReceiveChatEvent,
  subscribeToChatEvents,
} from "~/server/chat-events";
import { db } from "~/server/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const memberships = await db.serverMember.findMany({
    where: { userId },
    select: { serverId: true },
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
      const unsubscribe = subscribeToChatEvents((event) => {
        if (!canReceiveChatEvent(event, userId, serverIds)) return;
        enqueue(`event: chat\ndata: ${JSON.stringify(event)}\n\n`);
      });
      const keepAlive = setInterval(() => enqueue(": keep-alive\n\n"), 25_000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAlive);
        unsubscribe();
      };
      request.signal.addEventListener(
        "abort",
        () => {
          cleanup?.();
          controller.close();
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
