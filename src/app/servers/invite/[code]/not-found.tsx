import { Link2Off } from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/ui/button";

export default function InviteNotFound() {
  return (
    <main className="bg-connect-paper text-connect-ink flex min-h-dvh items-center justify-center px-5 py-10">
      <section className="border-connect-ink/15 bg-connect-surface w-full max-w-md rounded-md border p-6 text-center shadow-[8px_8px_0_var(--color-focus-on-dark)] sm:p-8">
        <div className="bg-connect-ink text-connect-paper mx-auto flex h-16 w-16 items-center justify-center rounded-2xl">
          <Link2Off className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">
          この招待は利用できません
        </h1>
        <p className="text-connect-muted mt-3 text-sm leading-7">
          招待リンクが無効か、現在このサーバーに参加できない状態です。新しい招待リンクを確認してください。
        </p>
        <Button
          asChild
          className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 mt-6 min-h-12 w-full px-5 motion-reduce:transition-none"
        >
          <Link href="/">ホームに戻る</Link>
        </Button>
      </section>
    </main>
  );
}
