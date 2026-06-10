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
        message="確認リンクが正しくありません。"
        linkHref="/auth/signup"
        linkLabel="新規登録に戻る"
      />
    );
  }

  const result = await verifyEmailToken(token);

  if (!result.success) {
    const message =
      result.reason === "expired"
        ? "確認リンクの有効期限が切れています。再度新規登録を行ってください。"
        : "確認リンクが無効です。再度新規登録を行ってください。";

    return (
      <VerifyEmailResult
        title="確認に失敗しました"
        message={message}
        linkHref="/auth/signup"
        linkLabel="新規登録に戻る"
      />
    );
  }

  return (
    <VerifyEmailResult
      title="メールアドレスを確認しました"
      message="アカウントの確認が完了しました。ログインしてください。"
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
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white">
      <div className="flex max-w-md flex-col items-center gap-6 px-4 text-center">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full text-xl ${
            success ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
          }`}
        >
          {success ? "✓" : "!"}
        </div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-zinc-400">{message}</p>
        <Link
          href={linkHref}
          className="rounded-lg bg-white px-6 py-2 font-medium text-zinc-950 transition hover:bg-zinc-200"
        >
          {linkLabel}
        </Link>
      </div>
    </main>
  );
}
