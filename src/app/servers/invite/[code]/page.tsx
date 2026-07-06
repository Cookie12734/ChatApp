import { notFound, redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { canJoinServerByInvite } from "~/features/server/server/message-permissions";
import { db } from "~/server/db";

type ServerInvitePageProps = {
  params: Promise<{ code: string }>;
};

export default async function ServerInvitePage({
  params,
}: ServerInvitePageProps) {
  const session = await auth();
  const { code } = await params;

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const server = await db.chatServer.findUnique({
    where: { inviteCode: code },
    select: {
      id: true,
      members: { select: { userId: true } },
    },
  });

  if (!server) {
    notFound();
  }

  const isMember = server.members.some(
    (member) => member.userId === session.user.id,
  );

  if (!isMember) {
    const memberIds = server.members.map((member) => member.userId);
    const block = await db.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: session.user.id, blockedId: { in: memberIds } },
          { blockedId: session.user.id, blockerId: { in: memberIds } },
        ],
      },
      select: { id: true },
    });

    if (
      !canJoinServerByInvite({
        hasBlockedMember: Boolean(block),
        isMember,
      })
    ) {
      notFound();
    }

    await db.serverMember.create({
      data: {
        serverId: server.id,
        userId: session.user.id,
        role: "MEMBER",
      },
    });
  }

  redirect(`/?serverId=${server.id}`);
}
