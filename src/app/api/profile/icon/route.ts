import { NextResponse } from "next/server";

import { auth } from "~/features/auth";
import { readStaticImageDataUrl } from "~/lib/static-image";
import { db } from "~/server/db";

export const runtime = "nodejs";

const maxFileSize = 5 * 1024 * 1024;

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "アイコンのアップロードに失敗しました";
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { message: "ログインが必要です" },
      { status: 401 },
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

    await db.user.update({
      where: { id: session.user.id },
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
