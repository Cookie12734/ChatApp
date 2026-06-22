import { ArrowLeft, UserRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { ProfileForm } from "~/features/profile/components/profile-form";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen bg-[#f6f0e4] px-5 py-6 text-[#18221f] sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#18221f]/15 pb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4]">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#9f4122] uppercase">
                Yohaku
              </p>
              <h1 className="text-2xl font-semibold">プロフィール</h1>
            </div>
          </div>
          <Link
            href="/servers"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#18221f]/20 bg-[#fff8ed] px-3 text-sm font-semibold text-[#18221f] transition hover:border-[#18221f]/45"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            部屋一覧へ
          </Link>
        </header>
        <ProfileForm />
      </div>
    </main>
  );
}
