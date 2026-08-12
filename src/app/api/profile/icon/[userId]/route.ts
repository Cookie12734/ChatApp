import { NextResponse } from "next/server";

import { auth } from "~/features/auth";
import { canViewProfile } from "~/features/profile/server/profile-permissions";
import { userIdSchema } from "~/lib/input";
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

  const parsedUserId = userIdSchema.safeParse((await params).userId);
  if (!parsedUserId.success) return new Response("Not found", { status: 404 });

  const userId = parsedUserId.data;
  const user = await db.user.findUnique({
    where: { userId },
    select: { id: true, image: true, name: true, userId: true },
  });
  if (!user) return new Response("Not found", { status: 404 });

  if (user.id !== session.user.id) {
    const [block, friendship, sharedServer] = await Promise.all([
      db.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: session.user.id, blockedId: user.id },
            { blockerId: user.id, blockedId: session.user.id },
          ],
        },
        select: { id: true },
      }),
      db.friendship.findUnique({
        where: {
          userId_friendId: {
            friendId: user.id,
            userId: session.user.id,
          },
        },
        select: { id: true },
      }),
      db.serverMember.findFirst({
        where: {
          userId: session.user.id,
          server: { members: { some: { userId: user.id } } },
        },
        select: { id: true },
      }),
    ]);

    if (
      !canViewProfile({
        isBlocked: Boolean(block),
        isFriend: Boolean(friendship),
        sharesServer: Boolean(sharedServer),
      })
    ) {
      return new Response("Not found", { status: 404 });
    }
  }

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
