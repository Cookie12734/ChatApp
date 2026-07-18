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

type ChatEventDatabase = Pick<PrismaClient, "chatEvent" | "serverMember">;

let nextCleanupAt = 0;

export function getChatEventRecord(
  event: ChatEvent,
  serverAudienceIds: string[] = [],
) {
  return {
    audienceIds:
      event.kind === "server" ? serverAudienceIds : [...event.userIds],
    kind: event.kind,
    payload: event,
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
  try {
    const serverAudienceIds =
      event.kind === "server"
        ? (
            await db.serverMember.findMany({
              where: { serverId: event.serverId },
              select: { userId: true },
            })
          ).map(({ userId }) => userId)
        : [];
    const record = getChatEventRecord(event, serverAudienceIds);

    await db.chatEvent.create({
      data: {
        audienceIds: record.audienceIds,
        kind: record.kind,
        payload: record.payload,
      },
    });
    void cleanupExpiredEvents(db);
  } catch (error) {
    console.error("Failed to publish chat event", error);
  }
}
