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
    return (
      <VerifyEmailResult
        title="確認できませんでした"
        message={
          tokenStatus === "expired"
            ? "確認リンクの有効期限が切れています。もう一度登録をお試しください。"
            : "確認リンクが無効です。もう一度登録をお試しください。"
        }
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f0e4] px-5 py-8 text-[#18221f]">
      <section className="w-full max-w-md rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-8 text-center shadow-[10px_10px_0_#d8efee]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e4f2dc] text-[#114744]">
          <MailCheck className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">
          メールアドレスを確認しますか？
        </h1>
        <p className="mt-4 leading-7 text-[#53615a]">
          この操作でアカウントが有効になります。登録した覚えがある場合だけ続けてください。
        </p>
        <VerifyEmailForm token={token} />
        <Link
          href="/auth/login"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#114744] underline-offset-4 hover:underline"
        >
          ログインへ戻る
        </Link>
      </section>
    </main>
  );
}

function VerifyEmailResult({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f0e4] px-5 py-8 text-[#18221f]">
      <section className="w-full max-w-md rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-8 text-center shadow-[10px_10px_0_#d8efee]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-[#fff1e8] text-[#9f4122]">
          <X className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">{title}</h1>
        <p className="mt-4 leading-7 text-[#53615a]">{message}</p>
        <Link
          href="/auth/signup"
          className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#18221f] px-5 font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37]"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          新規登録へ戻る
        </Link>
      </section>
    </main>
  );
}
