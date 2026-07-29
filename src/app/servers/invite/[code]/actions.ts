"use server";

import { notFound, redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { getAccessibleServerInviteWhere } from "~/features/server/server/invite-access";
import { db } from "~/server/db";
import { enforceRateLimits } from "~/server/rate-limit";

function getInvitePath(code: string) {
  return `/servers/invite/${encodeURIComponent(code)}`;
}

export async function joinServerByInvite(code: string, _formData: FormData) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(
      `/auth/login?callbackUrl=${encodeURIComponent(getInvitePath(code))}`,
    );
  }

  await enforceRateLimits([
    {
      limit: 20,
      scope: "server:join:user",
      subject: userId,
      windowMs: 60 * 60 * 1000,
    },
  ]);

  const server = await db.chatServer.findFirst({
    where: getAccessibleServerInviteWhere(code),
    select: { id: true },
  });

  if (!server) {
    notFound();
  }

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${userId}
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT "id"
      FROM "ChatServer"
      WHERE "id" = ${server.id}
      FOR UPDATE
    `;
    const current = await tx.chatServer.findFirst({
      where: { id: server.id, ...getAccessibleServerInviteWhere(code) },
      select: {
        _count: { select: { members: true } },
        members: {
          where: { userId },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!current) return null;
    if (current.members.length > 0) return { reason: null };

    const membershipCount = await tx.serverMember.count({ where: { userId } });
    if (membershipCount >= 100) return { reason: "membership-limit" as const };
    if (current._count.members >= 250)
      return { reason: "server-full" as const };

    await tx.serverMember.create({
      data: { role: "MEMBER", serverId: server.id, userId },
      select: { id: true },
    });
    return { reason: null };
  });

  if (!result) notFound();
  if (result.reason === "server-full") {
    redirect(`${getInvitePath(code)}?full=1`);
  }
  if (result.reason === "membership-limit") {
    redirect(`${getInvitePath(code)}?limit=1`);
  }

  redirect(`/?serverId=${encodeURIComponent(server.id)}`);
}
