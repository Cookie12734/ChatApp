import { NextResponse } from "next/server";

import { auth } from "~/features/auth";
import { createAttachmentThumbnail } from "~/features/chat/server/attachment-thumbnail";
import { db } from "~/server/db";

export const runtime = "nodejs";

function contentDisposition(fileName: string, inline: boolean) {
  return `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { attachmentId } = await params;
  const attachment = await db.messageAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      directMessage: { select: { receiverId: true, senderId: true } },
      expiresAt: true,
      externalUrl: true,
      fileName: true,
      groupMessage: {
        select: {
          senderId: true,
          group: {
            select: {
              members: {
                where: { userId: session.user.id },
                select: { userId: true },
                take: 1,
              },
            },
          },
        },
      },
      kind: true,
      mimeType: true,
      serverMessage: {
        select: {
          senderId: true,
          server: {
            select: {
              members: {
                where: { userId: session.user.id },
                select: { userId: true },
                take: 1,
              },
            },
          },
        },
      },
      uploaderId: true,
    },
  });
  if (!attachment) return new Response("Not found", { status: 404 });

  const directAllowed =
    attachment.directMessage?.senderId === session.user.id ||
    attachment.directMessage?.receiverId === session.user.id;
  const serverAllowed = Boolean(
    attachment.serverMessage?.server.members.length,
  );
  const groupAllowed = Boolean(attachment.groupMessage?.group.members.length);
  const stagedAllowed =
    !attachment.directMessage &&
    !attachment.serverMessage &&
    !attachment.groupMessage &&
    attachment.uploaderId === session.user.id &&
    Boolean(attachment.expiresAt && attachment.expiresAt > new Date());
  if (!directAllowed && !serverAllowed && !groupAllowed && !stagedAllowed) {
    return new Response("Not found", { status: 404 });
  }

  const peerIds = [
    ...(attachment.directMessage
      ? [
          attachment.directMessage.senderId === session.user.id
            ? attachment.directMessage.receiverId
            : attachment.directMessage.senderId,
        ]
      : []),
    ...(attachment.serverMessage ? [attachment.serverMessage.senderId] : []),
    ...(attachment.groupMessage ? [attachment.groupMessage.senderId] : []),
  ].filter((peerId) => peerId !== session.user.id);
  if (peerIds.length > 0) {
    const block = await db.userBlock.findFirst({
      where: {
        OR: [
          { blockedId: { in: peerIds }, blockerId: session.user.id },
          { blockedId: session.user.id, blockerId: { in: peerIds } },
        ],
      },
      select: { id: true },
    });
    if (block) return new Response("Not found", { status: 404 });
  }

  if (attachment.kind === "LINK" && attachment.externalUrl) {
    return NextResponse.redirect(attachment.externalUrl);
  }
  const preview =
    attachment.kind === "IMAGE" &&
    new URL(request.url).searchParams.get("preview") === "1";
  // Read binary content only after the same membership/block checks for both variants.
  let thumbnail = preview
    ? (
        await db.messageAttachment.findUnique({
          where: { id: attachmentId },
          select: { thumbnail: true },
        })
      )?.thumbnail
    : null;
  let data = thumbnail;
  if (!data) {
    data = (
      await db.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: { data: true },
      })
    )?.data;
    if (preview && data) {
      thumbnail = await createAttachmentThumbnail(data);
      if (thumbnail) {
        await db.messageAttachment.updateMany({
          where: { id: attachmentId, thumbnail: null },
          data: { thumbnail },
        });
        data = thumbnail;
      }
    }
  }
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(data, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": contentDisposition(
        thumbnail ? `${attachment.fileName}.webp` : attachment.fileName,
        attachment.kind === "IMAGE",
      ),
      "Content-Type": thumbnail ? "image/webp" : attachment.mimeType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
