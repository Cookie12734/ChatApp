import { Link2Off } from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/ui/button";

export default function InviteNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f6f0e4] px-5 py-10 text-[#18221f]">
      <section className="w-full max-w-md rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-6 text-center shadow-[8px_8px_0_#d8efee] sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#18221f] text-[#f6f0e4]">
          <Link2Off className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">
          この招待は利用できません
        </h1>
        <p className="mt-3 text-sm leading-7 text-[#53615a]">
          招待リンクが無効か、現在このサーバーに参加できない状態です。新しい招待リンクを確認してください。
        </p>
        <Button
          asChild
          className="mt-6 min-h-12 w-full bg-[#18221f] px-5 text-[#f6f0e4] hover:bg-[#2f3c37] motion-reduce:transition-none"
        >
          <Link href="/">ホームに戻る</Link>
        </Button>
      </section>
    </main>
  );
}
