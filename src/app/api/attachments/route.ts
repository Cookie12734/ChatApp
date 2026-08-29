import { NextResponse } from "next/server";

import { auth } from "~/features/auth";
import {
  getMessageAttachmentFileKind,
  MAX_MESSAGE_ATTACHMENT_SIZE,
  MESSAGE_ATTACHMENT_TTL_MS,
  normalizeAttachmentFileName,
  parseAttachmentUrl,
} from "~/features/chat/server/message-attachment";
import {
  readLimitedUploadFormData,
  UploadTooLargeError,
} from "~/lib/static-image";
import { enforceRateLimits } from "~/server/rate-limit";
import { RateLimitExceededError } from "~/server/rate-limit-policy";
import { db } from "~/server/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "ログインが必要です" },
      { status: 401 },
    );
  }

  try {
    await enforceRateLimits([
      {
        limit: 60,
        scope: "attachment:upload:user",
        subject: session.user.id,
        windowMs: 60 * 60 * 1000,
      },
    ]);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { message: "添付の回数が多すぎます。時間をおいてください" },
        { status: 429 },
      );
    }
    throw error;
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let file: FormDataEntryValue | null = null;
    let rawUrl: unknown;
    if (contentType.startsWith("application/json")) {
      const payload = (await request.json()) as { url?: unknown };
      rawUrl = payload.url;
    } else {
      const formData = await readLimitedUploadFormData(
        request,
        MAX_MESSAGE_ATTACHMENT_SIZE,
      );
      file = formData.get("file");
      rawUrl = formData.get("url");
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MESSAGE_ATTACHMENT_TTL_MS);

    await db.messageAttachment.deleteMany({
      where: {
        directMessageId: null,
        expiresAt: { lt: now },
        groupMessageId: null,
        serverMessageId: null,
      },
    });
    const stagedCount = await db.messageAttachment.count({
      where: {
        directMessageId: null,
        expiresAt: { gt: now },
        groupMessageId: null,
        serverMessageId: null,
        uploaderId: session.user.id,
      },
    });
    if (stagedCount >= 20) {
      return NextResponse.json(
        { message: "送信待ちの添付は20件までです" },
        { status: 429 },
      );
    }

    if (file instanceof File) {
      if (file.size < 1 || file.size > MAX_MESSAGE_ATTACHMENT_SIZE) {
        return NextResponse.json(
          { message: "ファイルは8MB以内にしてください" },
          { status: 400 },
        );
      }
      const data = new Uint8Array(await file.arrayBuffer());
      const kind = getMessageAttachmentFileKind(data, file.type);
      if (!kind) {
        return NextResponse.json(
          { message: "PNG、JPG、GIF、WebP、PDFを選択してください" },
          { status: 400 },
        );
      }
      const attachment = await db.messageAttachment.create({
        data: {
          data,
          expiresAt,
          fileName: normalizeAttachmentFileName(file.name),
          kind,
          mimeType: file.type,
          size: data.byteLength,
          uploaderId: session.user.id,
        },
        select: {
          fileName: true,
          id: true,
          kind: true,
          mimeType: true,
          size: true,
        },
      });
      return NextResponse.json({
        attachment: { ...attachment, url: `/api/attachments/${attachment.id}` },
      });
    }

    if (typeof rawUrl === "string") {
      const url = parseAttachmentUrl(rawUrl.trim());
      if (!url) {
        return NextResponse.json(
          { message: "HTTPSのURLを入力してください" },
          { status: 400 },
        );
      }
      const attachment = await db.messageAttachment.create({
        data: {
          expiresAt,
          externalUrl: url.href,
          fileName: url.hostname,
          kind: "LINK",
          mimeType: "text/uri-list",
          size: 0,
          uploaderId: session.user.id,
        },
        select: {
          fileName: true,
          id: true,
          kind: true,
          mimeType: true,
          size: true,
        },
      });
      return NextResponse.json({
        attachment: { ...attachment, url: `/api/attachments/${attachment.id}` },
      });
    }

    return NextResponse.json(
      { message: "ファイルまたはURLを指定してください" },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof UploadTooLargeError
        ? "ファイルは8MB以内にしてください"
        : "添付ファイルを保存できませんでした";
    return NextResponse.json({ message }, { status: 400 });
  }
}
