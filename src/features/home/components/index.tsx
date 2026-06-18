import { ArrowRight, MessageCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "~/features/auth";

const pulseNotes = [
  { label: "今日の部屋", value: "声を整える" },
  { label: "未読", value: "3件" },
  { label: "合図", value: "やわらかめ" },
];

const sampleMessages = [
  {
    author: "Mina",
    text: "この話題、急がずに続きから拾えるように置いておきます。",
  },
  {
    author: "Ren",
    text: "了解。メモを残しながら、あとで短くまとめます。",
  },
  {
    author: "Aoi",
    text: "今夜のチェックインは、軽い温度感で。",
  },
];

export async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/servers");
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f0e4] text-[#18221f]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-[#18221f]/15 pb-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#18221f] text-lg font-semibold text-[#f6f0e4]">
              余
            </span>
            <span className="text-xl font-semibold">Yohaku</span>
          </Link>
          <div className="hidden items-center gap-2 text-sm text-[#5d665f] sm:flex">
            <Sparkles className="h-4 w-4 text-[#cc5f2f]" aria-hidden="true" />
            <span>会話に余白をつくる場所</span>
          </div>
        </header>

        <section className="grid min-w-0 flex-1 items-center gap-10 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:py-14">
          <div className="max-w-xl min-w-0">
            <p className="mb-5 inline-flex rounded-md border border-[#cc5f2f]/35 bg-[#fff8ed] px-3 py-1 text-sm font-medium text-[#9f4122]">
              Quiet chat workspace
            </p>
            <h1 className="text-4xl leading-tight font-semibold sm:text-6xl">
              ただ流れる
              <br className="sm:hidden" />
              だけじゃない、
              <br />
              残る会話を。
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 [overflow-wrap:anywhere] break-all text-[#53615a] sm:break-normal">
              Yohakuは、会話をチャンネルの束ではなく、小さな机に並べるためのチャットです。
              いま話すこと、あとで拾うこと、そのあいだの空気を分けて置けます。
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#18221f] px-5 py-3 font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37] sm:w-auto"
              >
                ログイン
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/auth/signup"
                className="inline-flex w-full items-center justify-center rounded-md border border-[#18221f]/25 bg-[#fff8ed] px-5 py-3 font-semibold text-[#18221f] transition hover:border-[#18221f]/50 sm:w-auto"
              >
                はじめる
              </Link>
            </div>
          </div>

          <div className="relative min-h-[520px] max-w-full min-w-0 overflow-hidden rounded-md border border-[#18221f]/15 bg-[#fff8ed] shadow-[12px_12px_0_#d9e7d0]">
            <div className="flex h-full flex-col">
              <div className="grid border-b border-[#18221f]/15 bg-[#e4f2dc] sm:grid-cols-3">
                {pulseNotes.map((note) => (
                  <div
                    key={note.label}
                    className="border-b border-[#18221f]/10 px-5 py-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
                  >
                    <p className="text-xs font-semibold text-[#667163] uppercase">
                      {note.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold">{note.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid flex-1 lg:grid-cols-[180px_1fr]">
                <aside className="border-b border-[#18221f]/15 bg-[#f1e4d0] p-5 lg:border-r lg:border-b-0">
                  <p className="mb-4 text-xs font-semibold text-[#7b6757] uppercase">
                    Threads
                  </p>
                  <div className="space-y-2">
                    {["朝の確認", "草案置き場", "雑談の火種"].map(
                      (thread, index) => (
                        <div
                          key={thread}
                          className={`rounded-md px-3 py-2 text-sm font-medium ${
                            index === 0
                              ? "bg-[#18221f] text-[#f6f0e4]"
                              : "text-[#5f564d]"
                          }`}
                        >
                          {thread}
                        </div>
                      ),
                    )}
                  </div>
                </aside>

                <div className="flex flex-col p-5 sm:p-7">
                  <div className="mb-6 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[#7d877f] uppercase">
                        Room tone
                      </p>
                      <h2 className="text-2xl font-semibold">朝の確認</h2>
                    </div>
                    <span className="rounded-md bg-[#cc5f2f] px-3 py-1 text-sm font-semibold text-white">
                      live
                    </span>
                  </div>

                  <div className="space-y-4">
                    {sampleMessages.map((message) => (
                      <article
                        key={message.author}
                        className="rounded-md border border-[#18221f]/10 bg-white px-4 py-3"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#d8efee] text-sm font-semibold text-[#114744]">
                            {message.author[0]}
                          </span>
                          <p className="font-semibold">{message.author}</p>
                        </div>
                        <p className="leading-7 text-[#4f5a55]">
                          {message.text}
                        </p>
                      </article>
                    ))}
                  </div>

                  <div className="mt-auto pt-6">
                    <div className="flex items-center gap-3 rounded-md border border-[#18221f]/15 bg-[#f6f0e4] px-4 py-3 text-[#68716b]">
                      <MessageCircle className="h-5 w-5" aria-hidden="true" />
                      <span>次に残したい言葉を書く</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
