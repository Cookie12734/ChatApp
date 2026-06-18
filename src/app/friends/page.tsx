import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { FriendPanel } from "~/features/friend/components/friend-panel";

export default async function FriendsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-zinc-500">ChatApp</p>
            <h1 className="text-2xl font-bold">フレンド</h1>
          </div>
          <Link
            href="/servers"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            サーバー選択へ
          </Link>
        </div>
        <FriendPanel />
      </div>
    </main>
  );
}
