"use client";

import { Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "~/trpc/react";

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "処理に失敗しました";
}

export function ServerCreate() {
  const router = useRouter();
  const utils = api.useUtils();
  const [serverName, setServerName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const createServer = api.server.create.useMutation({
    onSuccess: async (server) => {
      setMessage(null);
      setServerName("");
      await utils.server.getOverview.invalidate();
      router.push(`/?serverId=${server.id}`);
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  return (
    <main className="min-h-screen bg-[#f6f0e4] text-[#18221f]">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-[#18221f]/15 pb-5">
          <Link
            href="/"
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff8ed] shadow-[5px_5px_0_#d8efee] transition hover:rounded-xl"
            aria-label="ホームへ戻る"
            title="ホームへ戻る"
          >
            <Image
              src="/connect-icon.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl object-cover"
              priority
            />
          </Link>
        </header>

        <section className="flex flex-1 items-center justify-center py-10">
          <form
            className="w-full max-w-xl rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-6 shadow-[12px_12px_0_#d9e7d0]"
            onSubmit={(event) => {
              event.preventDefault();
              setMessage(null);
              createServer.mutate({
                name: serverName,
              });
            }}
          >
            <div className="mb-5">
              <p className="text-sm font-semibold text-[#667163]">
                サーバー作成
              </p>
              <h1 className="mt-1 text-3xl font-semibold">
                作成したいサーバー名を入力
              </h1>
            </div>

            {message && (
              <p className="mb-4 rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] px-3 py-2 text-sm text-[#9f4122]">
                {message}
              </p>
            )}

            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor="server-name"
            >
              サーバー名
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="server-name"
                value={serverName}
                onChange={(event) => setServerName(event.target.value)}
                className="min-h-12 min-w-0 flex-1 rounded-md border border-[#18221f]/20 bg-white px-3 py-2 text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
                placeholder="例: 作業部屋"
                required
                maxLength={50}
                autoFocus
              />
              <button
                type="submit"
                disabled={createServer.isPending}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#18221f] px-5 py-2 text-sm font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {createServer.isPending ? "作成中..." : "作成"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
