import { NextResponse } from "next/server";

import { auth } from "~/features/auth";
import { canManageServer } from "~/features/server/server/message-permissions";
import { readStaticImageDataUrl } from "~/lib/static-image";
import { db } from "~/server/db";

export const runtime = "nodejs";

const maxFileSize = 2 * 1024 * 1024;

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

  const formData = await request.formData();
  const file = formData.get("icon");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { message: "画像ファイルを選択してください" },
      { status: 400 },
    );
  }

  try {
    const image = await readStaticImageDataUrl(file, maxFileSize);

    await db.chatServer.update({
      where: { id: serverId },
      data: { image },
    });

    return NextResponse.json({ image });
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error) },
      { status: 400 },
    );
  }
}
