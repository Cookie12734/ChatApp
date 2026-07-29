import { NextResponse } from "next/server";

import { auth } from "~/features/auth";
import {
  getProfileImageUrl,
  readLimitedUploadFormData,
  readStaticImageDataUrl,
} from "~/lib/static-image";
import { db } from "~/server/db";

export const runtime = "nodejs";

const maxFileSize = 256 * 1024;

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "アイコンのアップロードに失敗しました";
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "ログインが必要です" },
      { status: 401 },
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

    const user = await db.user.update({
      where: { id: session.user.id },
      data: { image },
      select: { userId: true },
    });

    return NextResponse.json({ image: getProfileImageUrl(user.userId) });
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error) },
      { status: 400 },
    );
  }
}
