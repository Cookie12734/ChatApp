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
    <main className="min-h-screen bg-[#f6f0e4] px-5 py-6 text-[#18221f] sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#18221f]/15 pb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4]">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#9f4122] uppercase">
                profile
              </p>
              <h1 className="text-2xl font-semibold">
                {profile.name ?? profile.userId}
              </h1>
            </div>
          </div>
          <BackButton href={from} />
        </header>

        <section className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-5 shadow-[8px_8px_0_#d8efee]">
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getProfileImageUrl(profile.userId)}
              alt=""
              className="h-24 w-24 rounded-md border border-[#18221f]/15 object-cover"
            />
            <div className="min-w-0">
              <h2 className="truncate text-3xl font-semibold">
                {profile.name ?? profile.userId}
              </h2>
              <p className="font-mono text-sm text-[#68716b]">
                @{profile.userId}
              </p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[#68716b]">
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
            <p className="mt-5 rounded-md border border-[#18221f]/10 bg-white px-3 py-2 text-sm text-[#53615a]">
              {profile.statusMessage}
            </p>
          )}

          <div className="mt-5 rounded-md border border-[#18221f]/10 bg-white p-4 leading-7 text-[#53615a]">
            {profile.bio ?? "自己紹介は未設定です"}
          </div>
        </section>
      </div>
    </main>
  );
}
