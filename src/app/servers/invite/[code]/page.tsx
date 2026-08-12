import { ArrowRight, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "~/components/ui/button";
import { auth } from "~/features/auth";
import { getAccessibleServerInviteWhere } from "~/features/server/server/invite-access";
import { getServerImageUrl } from "~/lib/static-image";
import { db } from "~/server/db";

import { joinServerByInvite } from "./actions";
import { InviteJoinForm } from "./invite-join-form";

type ServerInvitePageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ full?: string; limit?: string }>;
};

function getInvitePath(code: string) {
  return `/servers/invite/${encodeURIComponent(code)}`;
}

export default async function ServerInvitePage({
  params,
  searchParams,
}: ServerInvitePageProps) {
  const { code } = await params;
  const { full, limit } = await searchParams;
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
  const serverImage = getServerImageUrl(server.id, code);

  return (
    <main className="bg-connect-paper text-connect-ink flex min-h-dvh items-center justify-center overflow-x-hidden px-5 py-10">
      <section
        className="border-connect-ink/15 bg-connect-surface w-full max-w-lg rounded-md border p-6 text-center shadow-[10px_10px_0_var(--color-focus-on-dark)] sm:p-8"
        aria-labelledby="invite-title"
      >
        <div className="border-connect-surface bg-connect-ink text-connect-paper mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-[1.75rem] border-4 shadow-[0_0_0_1px_var(--color-rule-soft)]">
          <Image
            src={serverImage}
            alt={`${server.name}のサーバーアイコン`}
            width={96}
            height={96}
            unoptimized
            priority
            className="h-full w-full object-cover"
          />
        </div>

        <p className="text-connect-danger mt-6 text-sm font-semibold">
          サーバーへの招待
        </p>
        <h1
          id="invite-title"
          className="mt-2 text-3xl leading-tight font-semibold text-balance [overflow-wrap:anywhere]"
        >
          {server.name}
        </h1>

        <div className="text-connect-muted mt-4 flex items-center justify-center gap-2 text-sm font-medium">
          <Users className="h-4 w-4" aria-hidden="true" />
          <span>メンバー {formattedMemberCount}人</span>
        </div>

        <p className="text-connect-muted mx-auto mt-5 max-w-md text-sm leading-7 text-pretty [overflow-wrap:anywhere] whitespace-pre-wrap">
          {description?.length
            ? description
            : "このサーバーに参加して、メンバーとの会話を始めましょう。"}
        </p>

        <div className="border-connect-ink/10 mt-7 border-t pt-6">
          {full === "1" && (
            <p
              role="alert"
              className="text-connect-danger mb-4 text-sm font-semibold"
            >
              このサーバーは定員（250人）に達しています。
            </p>
          )}
          {limit === "1" && (
            <p
              role="alert"
              className="text-connect-danger mb-4 text-sm font-semibold"
            >
              参加できるサーバー数の上限（100件）に達しています。
            </p>
          )}
          {isMember ? (
            <Button
              asChild
              className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 min-h-12 w-full px-5 motion-reduce:transition-none"
            >
              <Link href={`/?serverId=${encodeURIComponent(server.id)}`}>
                サーバーを開く
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : full !== "1" && limit !== "1" ? (
            <InviteJoinForm joinAction={joinAction} />
          ) : null}

          {!isMember && (
            <p className="text-connect-neutral mt-3 text-xs leading-5">
              参加すると、このサーバーのメンバーとして表示されます。
            </p>
          )}
        </div>

        <p className="text-connect-neutral mt-6 text-xs [overflow-wrap:anywhere]">
          {session.user?.name
            ? `${session.user.name} としてログイン中`
            : "ログイン中のアカウントで続行します"}
        </p>
        <Link
          href="/"
          className="text-connect-action focus-visible:ring-connect-action mt-3 inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          ホームに戻る
        </Link>
      </section>
    </main>
  );
}
