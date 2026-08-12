import { Users } from "lucide-react";
import { redirect } from "next/navigation";

import { BackButton } from "~/components/back-button";
import { auth } from "~/features/auth";
import { FriendPanel } from "~/features/friend/components/friend-panel";
import { ServerRail } from "~/features/server/components/server-rail";

export default async function FriendsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/login?callbackUrl=%2Ffriends");
  }

  return (
    <main className="bg-connect-paper text-connect-ink grid h-dvh min-h-dvh grid-cols-1 grid-rows-[4rem_minmax(0,1fr)] overflow-hidden">
      <ServerRail />
      <div className="row-start-2 min-h-0 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <header className="border-connect-ink/15 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
            <div className="flex items-center gap-3">
              <span className="bg-connect-ink text-connect-paper flex h-10 w-10 items-center justify-center rounded-md">
                <Users className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-connect-danger text-sm font-semibold uppercase">
                  connect
                </p>
                <h1 className="text-2xl font-semibold">フレンド</h1>
              </div>
            </div>
            <BackButton />
          </header>
          <FriendPanel />
        </div>
      </div>
    </main>
  );
}
