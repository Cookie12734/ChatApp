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
    <main className="bg-connect-paper text-connect-ink min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="border-connect-ink/15 flex items-center justify-between border-b pb-5">
          <Link
            href="/"
            className="bg-connect-surface flex h-12 w-12 items-center justify-center rounded-2xl shadow-[5px_5px_0_var(--color-focus-on-dark)] transition hover:rounded-xl"
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
            className="border-connect-ink/15 bg-connect-surface w-full max-w-xl rounded-md border p-6 shadow-[12px_12px_0_var(--color-paper-3)]"
            onSubmit={(event) => {
              event.preventDefault();
              setMessage(null);
              createServer.mutate({
                name: serverName,
              });
            }}
          >
            <div className="mb-5">
              <p className="text-connect-muted text-sm font-semibold">
                サーバー作成
              </p>
              <h1 className="mt-1 text-3xl font-semibold">
                作成したいサーバー名を入力
              </h1>
            </div>

            {message && (
              <p className="border-connect-signal/25 bg-connect-danger-soft text-connect-danger mb-4 rounded-md border px-3 py-2 text-sm">
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
                className="border-connect-ink/20 bg-connect-surface text-connect-ink placeholder:text-connect-placeholder min-h-12 min-w-0 flex-1 rounded-md border px-3 py-2"
                placeholder="例: 作業部屋"
                required
                maxLength={50}
                autoFocus
              />
              <button
                type="submit"
                disabled={createServer.isPending}
                className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-2 text-sm font-semibold transition disabled:opacity-50"
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
