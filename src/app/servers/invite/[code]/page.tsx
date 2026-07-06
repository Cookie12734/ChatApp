import { notFound, redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { db } from "~/server/db";

type ServerInvitePageProps = {
  params: Promise<{ code: string }>;
};

export default async function ServerInvitePage({
  params,
}: ServerInvitePageProps) {
  const session = await auth();
  const { code } = await params;

  if (!session?.user) {
    redirect("/auth/login");
  }

  const server = await db.chatServer.findUnique({
    where: { inviteCode: code },
    select: { id: true },
  });

  if (!server) {
    notFound();
  }

  await db.serverMember.createMany({
    data: {
      serverId: server.id,
      userId: session.user.id,
      role: "MEMBER",
    },
    skipDuplicates: true,
  });

  redirect(`/?serverId=${server.id}`);
}
