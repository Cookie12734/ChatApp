import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { NextResponse } from "next/server";

import { auth } from "~/features/auth";
import { db } from "~/server/db";

export const runtime = "nodejs";

const maxFileSize = 2 * 1024 * 1024;
const uploadDir = path.join(
  process.cwd(),
  "public",
  "uploads",
  "profile-icons",
);

const imageTypes = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
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

  const extension = imageTypes[file.type as keyof typeof imageTypes];
  if (!extension) {
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

  const filename = `${session.user.id}-${randomUUID()}.${extension}`;
  const publicPath = `/uploads/profile-icons/${filename}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), bytes);

  await db.user.update({
    where: { id: session.user.id },
    data: { image: publicPath },
  });

  return NextResponse.json({ image: publicPath });
}
