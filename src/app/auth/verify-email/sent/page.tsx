import { MailCheck } from "lucide-react";
import Link from "next/link";

import { ResendVerificationEmailForm } from "~/features/auth/components/resend-verification-email-form";
import { getPendingVerificationEmailSession } from "~/features/auth/lib/verification-email-session";
import { getDevelopmentVerificationUrl } from "~/features/auth/lib/verification-token";

export default async function VerifyEmailSentPage() {
  const pendingSession = await getPendingVerificationEmailSession();
  const developmentVerificationUrl = pendingSession.email
    ? await getDevelopmentVerificationUrl(pendingSession.email)
    : null;

  return (
    <main className="bg-connect-paper text-connect-ink flex min-h-screen items-center justify-center px-5 py-8">
      <section className="border-connect-ink/15 bg-connect-surface w-full max-w-md rounded-md border p-8 text-center shadow-[10px_10px_0_var(--color-focus-on-dark)]">
        <div className="bg-connect-highlight text-connect-action mx-auto flex h-12 w-12 items-center justify-center rounded-md">
          <MailCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">
          確認メールを送信しました
        </h1>
        <p className="text-connect-muted mt-4 leading-7">
          入力したメールアドレスに確認リンクを送りました。リンクを開くと登録が完了します。
        </p>
        <p className="text-connect-neutral mt-4 text-sm leading-6">
          開発環境では、ターミナルに確認リンクが表示されます。
        </p>
        {developmentVerificationUrl && (
          <Link
            href={developmentVerificationUrl}
            className="border-connect-ink/15 bg-connect-surface text-connect-action hover:bg-connect-success-soft mt-4 block rounded-md border px-4 py-3 text-sm font-semibold transition"
          >
            開発用: メール確認リンクを開く
          </Link>
        )}
        <ResendVerificationEmailForm
          hasPendingEmail={Boolean(pendingSession.email)}
          initialRemainingSeconds={pendingSession.remainingSeconds}
        />
        <Link
          href="/auth/login"
          className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 mt-6 inline-flex rounded-md px-5 py-3 font-semibold transition"
        >
          ログインページへ
        </Link>
      </section>
    </main>
  );
}
