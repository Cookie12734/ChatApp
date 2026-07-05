import { NextResponse } from "next/server";

import { auth } from "~/features/auth";
import { db } from "~/server/db";

export const runtime = "nodejs";

const maxFileSize = 2 * 1024 * 1024;

const imageTypes = {
  "image/gif": true,
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
} as const;

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

  if (!imageTypes[file.type as keyof typeof imageTypes]) {
    return NextResponse.json(
      { message: "PNG、JPG、WebP、GIF の画像を選択してください" },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { message: "空のファイルはアップロードできません" },
      { status: 400 },
    );
  }

  if (file.size > maxFileSize) {
    return NextResponse.json(
      { message: "画像は2MB以内にしてください" },
      { status: 400 },
    );
  }

  const image = `data:${file.type};base64,${Buffer.from(
    await file.arrayBuffer(),
  ).toString("base64")}`;

  await db.user.update({
    where: { id: session.user.id },
    data: { image },
  });

  return NextResponse.json({ image });
}
