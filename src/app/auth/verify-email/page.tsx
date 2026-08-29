import { Check, MailCheck, X } from "lucide-react";
import Link from "next/link";

import { getVerificationTokenStatus } from "~/features/auth/lib/verification-token";

import { VerifyEmailForm } from "./verify-email-form";

type VerifyEmailPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <VerifyEmailResult
        title="無効なリンクです"
        message="確認リンクが正しくありません。もう一度登録をお試しください。"
      />
    );
  }

  const tokenStatus = await getVerificationTokenStatus(token);

  if (tokenStatus !== "valid") {
    const isExpired = tokenStatus === "expired";

    return (
      <VerifyEmailResult
        title="確認できませんでした"
        message={
          isExpired
            ? "確認リンクの有効期限が切れています。登録時のメールアドレスとパスワードでログインすると、確認メールを再送できます。"
            : tokenStatus === "legacy"
              ? "以前の確認リンクは無効です。新規登録から登録し直してください。"
              : "確認リンクが無効です。もう一度登録をお試しください。"
        }
        href={isExpired ? "/auth/login" : "/auth/signup"}
        linkLabel={isExpired ? "ログインへ" : "新規登録へ戻る"}
      />
    );
  }

  return (
    <main className="bg-connect-paper text-connect-ink flex min-h-screen items-center justify-center px-5 py-8">
      <section className="border-connect-ink/15 bg-connect-surface w-full max-w-md rounded-md border p-8 text-center shadow-[10px_10px_0_var(--color-focus-on-dark)]">
        <div className="bg-connect-highlight text-connect-action mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
          <MailCheck className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">
          メールアドレスを確認しますか？
        </h1>
        <p className="text-connect-muted mt-4 leading-7">
          登録時のパスワードを入力するとアカウントが有効になります。登録した覚えがない場合は操作せず、このページを閉じてください。
        </p>
        <VerifyEmailForm token={token} />
        <Link
          href="/auth/login"
          className="text-connect-action mt-4 inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold underline-offset-4 hover:underline"
        >
          ログインへ戻る
        </Link>
      </section>
    </main>
  );
}

function VerifyEmailResult({
  href = "/auth/signup",
  linkLabel = "新規登録へ戻る",
  title,
  message,
}: {
  href?: string;
  linkLabel?: string;
  title: string;
  message: string;
}) {
  return (
    <main className="bg-connect-paper text-connect-ink flex min-h-screen items-center justify-center px-5 py-8">
      <section className="border-connect-ink/15 bg-connect-surface w-full max-w-md rounded-md border p-8 text-center shadow-[10px_10px_0_var(--color-focus-on-dark)]">
        <div className="bg-connect-danger-soft text-connect-danger mx-auto flex h-12 w-12 items-center justify-center rounded-md">
          <X className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">{title}</h1>
        <p className="text-connect-muted mt-4 leading-7">{message}</p>
        <Link
          href={href}
          className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 font-semibold transition"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {linkLabel}
        </Link>
      </section>
    </main>
  );
}
