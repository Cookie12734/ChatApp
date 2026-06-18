import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "~/features/auth";

export async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/servers");
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-950 px-4 py-10 text-white">
      <div className="flex w-full flex-col items-center gap-8 text-center">
        <h1 className="text-5xl font-bold tracking-tight">ChatApp</h1>
        <p className="max-w-md text-lg text-zinc-400">ChatAppへようこそ</p>

        <div className="flex gap-3">
          <Link
            href="/auth/login"
            className="rounded-lg bg-white px-6 py-2 font-medium text-zinc-950 transition hover:bg-zinc-200"
          >
            ログイン
          </Link>
          <Link
            href="/auth/signup"
            className="rounded-lg border border-zinc-700 px-6 py-2 font-medium transition hover:bg-zinc-900"
          >
            新規登録
          </Link>
        </div>
      </div>
    </main>
  );
}
