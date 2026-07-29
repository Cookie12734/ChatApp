import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function SafetyPage() {
  return (
    <main className="min-h-dvh bg-[#f6f0e4] px-5 py-10 text-[#18221f]">
      <article className="mx-auto max-w-3xl rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-6 shadow-[10px_10px_0_#d8efee] sm:p-9">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-[#114744] underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:outline-none"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          アプリへ戻る
        </Link>

        <div className="mt-5 flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-[#114744]" aria-hidden="true" />
          <h1 className="text-3xl font-semibold">安全に利用するために</h1>
        </div>

        <section className="mt-8 rounded-md border border-[#9f4122]/30 bg-[#fff1e8] p-5">
          <h2 className="text-xl font-semibold">今すぐ危険があるとき</h2>
          <p className="mt-3 leading-7">
            このアプリだけで解決しようとせず、安全な場所へ移動し、地域の緊急サービスや信頼できる大人・家族へすぐ連絡してください。
          </p>
          <p className="mt-3 leading-7">
            日本では、厚生労働省の「こころの健康相談統一ダイヤル」
            <a
              href="tel:+81570064556?oai_link_source=model_response_hotline"
              className="mx-1 font-semibold text-[#0b5f89] underline"
            >
              0570-064-556
            </a>
            も利用できます。受付日時などは
            <a
              href="https://www.mhlw.go.jp/mamorouyokokoro/?oai_link_source=model_response_hotline"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 font-semibold text-[#0b5f89] underline"
            >
              厚生労働省の案内
            </a>
            を確認してください。
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">
            嫌がらせ・危険な投稿を見たとき
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6 leading-7">
            <li>メッセージの操作メニューから「通報」を選びます。</li>
            <li>必要なら相手をブロックし、会話から離れてください。</li>
            <li>
              サーバー内の通報はサーバー管理者が確認できます。重大または緊急の危険は、アプリ外の適切な窓口にも連絡してください。
            </li>
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">記録とプライバシー</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 leading-7">
            <li>
              メッセージは送信者が削除するか、アカウント・サーバーが削除されるまで保存されます。
            </li>
            <li>
              通報時は審査に必要なメッセージ本文の写しを保存します。元のメッセージを削除しても通報記録は残ります。
            </li>
            <li>アカウント削除後、通報記録に残る利用者IDは匿名化されます。</li>
          </ul>
        </section>
      </article>
    </main>
  );
}
