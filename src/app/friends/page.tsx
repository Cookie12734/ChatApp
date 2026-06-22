import { Users } from "lucide-react";
import { redirect } from "next/navigation";

import { BackButton } from "~/components/back-button";
import { auth } from "~/features/auth";
import { FriendPanel } from "~/features/friend/components/friend-panel";

export default async function FriendsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen bg-[#f6f0e4] px-5 py-6 text-[#18221f] sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#18221f]/15 pb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4]">
              <Users className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#9f4122] uppercase">
                connect
              </p>
              <h1 className="text-2xl font-semibold">フレンド</h1>
            </div>
          </div>
          <BackButton />
        </header>
        <FriendPanel />
      </div>
    </main>
  );
}
