import { Check, X } from "lucide-react";
import Link from "next/link";

import { verifyEmailToken } from "~/features/auth/lib/verification-token";

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
        linkHref="/auth/signup"
        linkLabel="新規登録へ戻る"
      />
    );
  }

  const result = await verifyEmailToken(token);

  if (!result.success) {
    const message =
      result.reason === "expired"
        ? "確認リンクの有効期限が切れています。もう一度登録をお試しください。"
        : "確認リンクが無効です。もう一度登録をお試しください。";

    return (
      <VerifyEmailResult
        title="確認に失敗しました"
        message={message}
        linkHref="/auth/signup"
        linkLabel="新規登録へ戻る"
      />
    );
  }

  return (
    <VerifyEmailResult
      title="メールアドレスを確認しました"
      message="アカウントの確認が完了しました。ログインしてYohakuを始めましょう。"
      linkHref="/auth/login?verified=1"
      linkLabel="ログインする"
      success
    />
  );
}

function VerifyEmailResult({
  title,
  message,
  linkHref,
  linkLabel,
  success = false,
}: {
  title: string;
  message: string;
  linkHref: string;
  linkLabel: string;
  success?: boolean;
}) {
  const Icon = success ? Check : X;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f0e4] px-5 py-8 text-[#18221f]">
      <section className="w-full max-w-md rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-8 text-center shadow-[10px_10px_0_#d8efee]">
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-md ${
            success
              ? "bg-[#e4f2dc] text-[#114744]"
              : "bg-[#fff1e8] text-[#9f4122]"
          }`}
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">{title}</h1>
        <p className="mt-4 leading-7 text-[#53615a]">{message}</p>
        <Link
          href={linkHref}
          className="mt-6 inline-flex rounded-md bg-[#18221f] px-5 py-3 font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37]"
        >
          {linkLabel}
        </Link>
      </section>
    </main>
  );
}
