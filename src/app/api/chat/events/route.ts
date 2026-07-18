import { auth } from "~/features/auth";
import { db } from "~/server/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let lastEventId =
    (
      await db.chatEvent.findFirst({
        where: { audienceIds: { has: userId } },
        orderBy: { id: "desc" },
        select: { id: true },
      })
    )?.id ?? 0n;
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let isPolling = false;
      const enqueue = (value: string) => {
        if (!closed) controller.enqueue(encoder.encode(value));
      };
      const poll = async () => {
        if (closed || isPolling) return;
        isPolling = true;

        try {
          const events = await db.chatEvent.findMany({
            where: {
              audienceIds: { has: userId },
              id: { gt: lastEventId },
            },
            orderBy: { id: "asc" },
            select: { id: true, payload: true },
            take: 100,
          });

          for (const event of events) {
            lastEventId = event.id;
            enqueue(
              `event: chat\ndata: ${JSON.stringify(event.payload)}\n\n`,
            );
          }
        } catch (error) {
          console.error("Failed to poll chat events", error);
        } finally {
          isPolling = false;
        }
      };
      const pollTimer = setInterval(() => void poll(), 1000);
      const keepAlive = setInterval(() => enqueue(": keep-alive\n\n"), 25_000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        clearInterval(keepAlive);
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
