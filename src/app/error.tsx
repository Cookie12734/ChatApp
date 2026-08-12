"use client";

import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="bg-connect-paper text-connect-ink flex min-h-screen items-center justify-center px-5">
      <section className="border-connect-signal/25 bg-connect-surface w-full max-w-md rounded-md border p-6 text-center shadow-[8px_8px_0_var(--color-focus-on-dark)]">
        <AlertTriangle className="text-connect-signal mx-auto mb-4 h-10 w-10" />
        <h1 className="text-xl font-semibold">エラーが発生しました</h1>
        <p className="text-connect-muted mt-2 text-sm leading-6">
          時間をおいてもう一度お試しください。
        </p>
        <button
          type="button"
          onClick={reset}
          className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 mt-5 inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 font-semibold transition"
        >
          再読み込み
        </button>
      </section>
    </main>
  );
}
