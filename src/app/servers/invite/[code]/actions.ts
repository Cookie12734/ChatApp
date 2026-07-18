"use server";

import { notFound, redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { getAccessibleServerInviteWhere } from "~/features/server/server/invite-access";
import { db } from "~/server/db";

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

  const server = await db.chatServer.findFirst({
    where: getAccessibleServerInviteWhere(code),
    select: {
      id: true,
      members: {
        where: { userId },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!server) {
    notFound();
  }

  if (server.members.length === 0) {
    await db.serverMember.upsert({
      where: {
        serverId_userId: {
          serverId: server.id,
          userId,
        },
      },
      create: {
        serverId: server.id,
        userId,
        role: "MEMBER",
      },
      update: {},
      select: { id: true },
    });
  }

  redirect(`/?serverId=${encodeURIComponent(server.id)}`);
}
