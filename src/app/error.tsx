"use client";

import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f0e4] px-5 text-[#18221f]">
      <section className="w-full max-w-md rounded-md border border-[#cc5f2f]/25 bg-[#fff8ed] p-6 text-center shadow-[8px_8px_0_#d8efee]">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-[#cc5f2f]" />
        <h1 className="text-xl font-semibold">エラーが発生しました</h1>
        <p className="mt-2 text-sm leading-6 text-[#53615a]">
          時間をおいてもう一度お試しください。
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-[#18221f] px-4 py-2 font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37]"
        >
          再読み込み
        </button>
      </section>
    </main>
  );
}
