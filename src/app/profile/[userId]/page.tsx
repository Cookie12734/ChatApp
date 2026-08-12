import { UserRound } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { BackButton } from "~/components/back-button";
import { auth } from "~/features/auth";
import {
  getPresenceDisplayLabel,
  getPresenceDotClassName,
} from "~/features/profile/presence";
import { canViewProfile } from "~/features/profile/server/profile-permissions";
import { getProfileImageUrl } from "~/lib/static-image";
import { db } from "~/server/db";

type ProfileDetailPageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ from?: string }>;
};

export default async function ProfileDetailPage({
  params,
  searchParams,
}: ProfileDetailPageProps) {
  const [session, { userId }, { from }] = await Promise.all([
    auth(),
    params,
    searchParams,
  ]);
  const profilePath = `/profile/${encodeURIComponent(userId)}`;
  const callbackUrl = from
    ? `${profilePath}?from=${encodeURIComponent(from)}`
    : profilePath;

  if (!session?.user?.id) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const profile = await db.user.findUnique({
    where: { userId },
    select: {
      bio: true,
      id: true,
      name: true,
      presenceStatus: true,
      statusMessage: true,
      userId: true,
    },
  });

  if (!profile) {
    notFound();
  }

  if (profile.id === session.user.id) {
    redirect(`/profile${from ? `?from=${encodeURIComponent(from)}` : ""}`);
  }

  const [block, friendship, sharedServer] = await Promise.all([
    db.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: session.user.id, blockedId: profile.id },
          { blockerId: profile.id, blockedId: session.user.id },
        ],
      },
      select: { id: true },
    }),
    db.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: session.user.id,
          friendId: profile.id,
        },
      },
      select: { id: true },
    }),
    db.serverMember.findFirst({
      where: {
        userId: session.user.id,
        server: {
          members: {
            some: { userId: profile.id },
          },
        },
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
    notFound();
  }

  return (
    <main className="bg-connect-paper text-connect-ink min-h-screen px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="border-connect-ink/15 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
          <div className="flex items-center gap-3">
            <span className="bg-connect-ink text-connect-paper flex h-10 w-10 items-center justify-center rounded-md">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-connect-danger text-sm font-semibold uppercase">
                profile
              </p>
              <h1 className="text-2xl font-semibold">
                {profile.name ?? profile.userId}
              </h1>
            </div>
          </div>
          <BackButton href={from} />
        </header>

        <section className="border-connect-ink/15 bg-connect-surface rounded-md border p-5 shadow-[8px_8px_0_var(--color-focus-on-dark)]">
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getProfileImageUrl(profile.userId)}
              alt=""
              className="border-connect-ink/15 h-24 w-24 rounded-md border object-cover"
            />
            <div className="min-w-0">
              <h2 className="truncate text-3xl font-semibold">
                {profile.name ?? profile.userId}
              </h2>
              <p className="text-connect-neutral font-mono text-sm">
                @{profile.userId}
              </p>
              <p className="text-connect-neutral mt-2 inline-flex items-center gap-1.5 text-sm">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${getPresenceDotClassName(
                    profile.presenceStatus,
                  )}`}
                />
                {getPresenceDisplayLabel(profile.presenceStatus)}
              </p>
            </div>
          </div>

          {profile.statusMessage && (
            <p className="border-connect-ink/10 bg-connect-surface text-connect-muted mt-5 rounded-md border px-3 py-2 text-sm">
              {profile.statusMessage}
            </p>
          )}

          <div className="border-connect-ink/10 bg-connect-surface text-connect-muted mt-5 rounded-md border p-4 leading-7">
            {profile.bio ?? "自己紹介は未設定です"}
          </div>
        </section>
      </div>
    </main>
  );
}
