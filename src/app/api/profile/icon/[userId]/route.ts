import { NextResponse } from "next/server";

import { auth } from "~/features/auth";
import {
  createFallbackAvatarSvg,
  decodeStaticImageDataUrl,
} from "~/lib/static-image";
import { db } from "~/server/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { userId } = await params;
  const user = await db.user.findUnique({
    where: { userId },
    select: { image: true, name: true, userId: true },
  });
  if (!user) return new Response("Not found", { status: 404 });

  const decoded = user.image ? decodeStaticImageDataUrl(user.image) : null;
  if (decoded) {
    return new Response(decoded.bytes, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Type": decoded.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (user.image?.startsWith("https://")) {
    return NextResponse.redirect(user.image);
  }

  return new Response(createFallbackAvatarSvg(user.name ?? user.userId), {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
