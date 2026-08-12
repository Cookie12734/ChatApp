import { UserRound } from "lucide-react";
import { redirect } from "next/navigation";

import { BackButton } from "~/components/back-button";
import { auth } from "~/features/auth";
import { ProfileForm } from "~/features/profile/components/profile-form";

type ProfilePageProps = {
  searchParams: Promise<{ from?: string }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const [session, { from }] = await Promise.all([auth(), searchParams]);
  const callbackUrl = from
    ? `/profile?from=${encodeURIComponent(from)}`
    : "/profile";

  if (!session?.user?.id) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return (
    <main className="bg-connect-paper text-connect-ink min-h-screen px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="border-connect-ink/15 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
          <div className="flex items-center gap-3">
            <span className="bg-connect-ink text-connect-paper flex h-10 w-10 items-center justify-center rounded-md">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-connect-danger text-sm font-semibold uppercase">
                connect
              </p>
              <h1 className="text-2xl font-semibold">プロフィール</h1>
            </div>
          </div>
          <BackButton href={from} />
        </header>
        <ProfileForm />
      </div>
    </main>
  );
}
