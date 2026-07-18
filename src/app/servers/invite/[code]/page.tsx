import { ArrowRight, MessageCircle, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "~/components/ui/button";
import { auth } from "~/features/auth";
import { getAccessibleServerInviteWhere } from "~/features/server/server/invite-access";
import { db } from "~/server/db";

import { joinServerByInvite } from "./actions";
import { InviteJoinForm } from "./invite-join-form";

type ServerInvitePageProps = {
  params: Promise<{ code: string }>;
};

function getInvitePath(code: string) {
  return `/servers/invite/${encodeURIComponent(code)}`;
}

export default async function ServerInvitePage({
  params,
}: ServerInvitePageProps) {
  const { code } = await params;
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
      name: true,
      description: true,
      image: true,
      _count: {
        select: { members: true },
      },
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

  const isMember = server.members.length > 0;
  const joinAction = joinServerByInvite.bind(null, code);
  const formattedMemberCount = new Intl.NumberFormat("ja-JP").format(
    server._count.members,
  );
  const description = server.description?.trim();

  return (
    <main className="flex min-h-dvh items-center justify-center overflow-x-hidden bg-[#f6f0e4] px-5 py-10 text-[#18221f]">
      <section
        className="w-full max-w-lg rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-6 text-center shadow-[10px_10px_0_#d8efee] sm:p-8"
        aria-labelledby="invite-title"
      >
        <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-[1.75rem] border-4 border-[#fff8ed] bg-[#18221f] text-[#f6f0e4] shadow-[0_0_0_1px_rgba(24,34,31,0.12)]">
          {server.image ? (
            <Image
              src={server.image}
              alt={`${server.name}のサーバーアイコン`}
              width={96}
              height={96}
              unoptimized
              priority
              className="h-full w-full object-cover"
            />
          ) : (
            <MessageCircle className="h-10 w-10" aria-hidden="true" />
          )}
        </div>

        <p className="mt-6 text-sm font-semibold text-[#9f4122]">
          サーバーへの招待
        </p>
        <h1
          id="invite-title"
          className="mt-2 text-3xl leading-tight font-semibold text-balance [overflow-wrap:anywhere]"
        >
          {server.name}
        </h1>

        <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-[#53615a]">
          <Users className="h-4 w-4" aria-hidden="true" />
          <span>メンバー {formattedMemberCount}人</span>
        </div>

        <p className="mx-auto mt-5 max-w-md text-sm leading-7 text-pretty [overflow-wrap:anywhere] whitespace-pre-wrap text-[#53615a]">
          {description?.length
            ? description
            : "このサーバーに参加して、メンバーとの会話を始めましょう。"}
        </p>

        <div className="mt-7 border-t border-[#18221f]/10 pt-6">
          {isMember ? (
            <Button
              asChild
              className="min-h-12 w-full bg-[#18221f] px-5 text-[#f6f0e4] hover:bg-[#2f3c37] motion-reduce:transition-none"
            >
              <Link href={`/?serverId=${encodeURIComponent(server.id)}`}>
                サーバーを開く
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <InviteJoinForm joinAction={joinAction} />
          )}

          {!isMember && (
            <p className="mt-3 text-xs leading-5 text-[#68716b]">
              参加すると、このサーバーのメンバーとして表示されます。
            </p>
          )}
        </div>

        <p className="mt-6 text-xs [overflow-wrap:anywhere] text-[#68716b]">
          {session.user?.name
            ? `${session.user.name} としてログイン中`
            : "ログイン中のアカウントで続行します"}
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-semibold text-[#114744] underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          ホームに戻る
        </Link>
      </section>
    </main>
  );
}
