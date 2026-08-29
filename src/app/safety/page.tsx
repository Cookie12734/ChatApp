import { ArrowLeft, ExternalLink, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";

import {
  MATCHING_SAFETY_NOTICE,
  SAFETY_RESOURCES,
} from "~/features/chat/matching-prompts";

export default function SafetyPage() {
  return (
    <main className="bg-connect-paper text-connect-ink min-h-dvh px-5 py-10">
      <article className="border-connect-ink/15 bg-connect-surface mx-auto max-w-3xl rounded-md border p-6 shadow-[10px_10px_0_var(--color-focus-soft)] sm:p-9">
        <Link
          href="/"
          className="text-connect-action focus-visible:ring-connect-action inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          アプリへ戻る
        </Link>

        <div className="mt-5 flex items-center gap-3">
          <ShieldCheck
            className="text-connect-action h-8 w-8"
            aria-hidden="true"
          />
          <h1 className="text-3xl font-semibold">安全に利用するために</h1>
        </div>

        <section className="border-connect-danger/30 bg-connect-danger-soft mt-8 rounded-md border p-5">
          <h2 className="text-xl font-semibold">今すぐ危険があるとき</h2>
          <p className="mt-3 leading-7">
            このアプリ内だけで解決しようとせず、安全な場所へ移動し、地域の緊急サービスや信頼できる人へ連絡してください。
          </p>
          <p className="mt-3 leading-7">
            日本では、厚生労働省の「こころの健康相談統一ダイヤル」へ相談できます。対応時間は地域により異なります。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={SAFETY_RESOURCES.phoneHref}
              className="bg-connect-action text-connect-surface hover:bg-connect-action-hover inline-flex min-h-11 items-center gap-2 rounded-md px-4 font-semibold transition-colors"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              {SAFETY_RESOURCES.phone}
            </a>
            <a
              href={SAFETY_RESOURCES.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="border-connect-action text-connect-action hover:bg-connect-highlight inline-flex min-h-11 items-center gap-2 rounded-md border px-4 font-semibold transition-colors"
            >
              厚生労働省の相談窓口
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">
            マッチングで会話を始める前に
          </h2>
          <p className="mt-3 leading-7">{MATCHING_SAFETY_NOTICE}</p>
          <ul className="mt-3 list-disc space-y-2 pl-6 leading-7">
            <li>
              本名、住所、学校・勤務先、連絡先を急いで共有しないでください。
            </li>
            <li>相手の同意なく、会話内容を外部へ公開しないでください。</li>
            <li>会話はいつでも終了できます。同意は後から変更できます。</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">
            嫌がらせ・危険な投稿を見たとき
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6 leading-7">
            <li>メッセージの操作メニューから「通報」を選びます。</li>
            <li>必要なら相手をブロックし、会話から離れてください。</li>
            <li>差し迫った危険は、アプリ外の適切な窓口へ連絡してください。</li>
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">記録とプライバシー</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 leading-7">
            <li>通知の本文プレビューは初期設定で無効です。</li>
            <li>通報時は審査に必要なメッセージ内容の写しを保存します。</li>
            <li>
              保存済みメッセージも、会話へのアクセスを失うと表示されません。
            </li>
          </ul>
        </section>
      </article>
    </main>
  );
}
