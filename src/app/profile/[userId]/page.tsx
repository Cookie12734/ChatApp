import { UserRound } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { BackButton } from "~/components/back-button";
import { auth } from "~/features/auth";
import { db } from "~/server/db";

type ProfileDetailPageProps = {
  params: Promise<{ userId: string }>;
};

export default async function ProfileDetailPage({
  params,
}: ProfileDetailPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  const { userId } = await params;
  const profile = await db.user.findUnique({
    where: { userId },
    select: {
      bio: true,
      image: true,
      name: true,
      statusMessage: true,
      userId: true,
    },
  });

  if (!profile) {
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
          <BackButton />
        </header>

        <section className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-5 shadow-[8px_8px_0_#d8efee]">
          <div className="flex flex-wrap items-center gap-4">
            {profile.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.image}
                alt=""
                className="h-24 w-24 rounded-md border border-[#18221f]/15 object-cover"
              />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-md bg-[#18221f] text-3xl font-semibold text-[#f6f0e4]">
                {(profile.name ?? profile.userId).slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-3xl font-semibold">
                {profile.name ?? profile.userId}
              </h2>
              <p className="font-mono text-sm text-[#68716b]">
                @{profile.userId}
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
