import { NextResponse } from "next/server";

import { auth } from "~/features/auth";
import { canManageServer } from "~/features/server/server/message-permissions";
import {
  createFallbackAvatarSvg,
  decodeStaticImageDataUrl,
  getServerImageUrl,
  readLimitedUploadFormData,
  readStaticImageDataUrl,
} from "~/lib/static-image";
import { db } from "~/server/db";

export const runtime = "nodejs";

const maxFileSize = 128 * 1024;

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "アイコンのアップロードに失敗しました";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "ログインが必要です" },
      { status: 401 },
    );
  }

  const { serverId } = await params;
  const membership = await db.serverMember.findUnique({
    where: {
      serverId_userId: {
        serverId,
        userId: session.user.id,
      },
    },
    select: { role: true },
  });

  if (!canManageServer(membership?.role)) {
    return NextResponse.json(
      { message: "サーバーアイコンを変更できるのは管理者だけです" },
      { status: 403 },
    );
  }

  try {
    const formData = await readLimitedUploadFormData(request, maxFileSize);
    const file = formData.get("icon");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "画像ファイルを選択してください" },
        { status: 400 },
      );
    }

    const image = await readStaticImageDataUrl(file, maxFileSize);

    await db.chatServer.update({
      where: { id: serverId },
      data: { image },
    });

    return NextResponse.json({ image: getServerImageUrl(serverId) });
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error) },
      { status: 400 },
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { serverId } = await params;
  const inviteCode = new URL(request.url).searchParams.get("inviteCode");
  const server = await db.chatServer.findFirst({
    where: {
      id: serverId,
      OR: [
        { members: { some: { userId: session.user.id } } },
        { visibility: "PUBLIC" },
        ...(inviteCode ? [{ inviteCode }] : []),
      ],
    },
    select: { image: true, name: true },
  });
  if (!server) return new Response("Not found", { status: 404 });

  const decoded = server.image ? decodeStaticImageDataUrl(server.image) : null;
  if (decoded) {
    return new Response(decoded.bytes, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Type": decoded.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (server.image?.startsWith("https://")) {
    return NextResponse.redirect(server.image);
  }

  return new Response(createFallbackAvatarSvg(server.name), {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
