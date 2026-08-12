import { KeyRound, X } from "lucide-react";
import Link from "next/link";

import { ResetPasswordForm } from "~/features/auth/components/reset-password-form";
import { getPasswordResetTokenStatus } from "~/features/auth/lib/password-reset";

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token } = await searchParams;
  const status = token
    ? await getPasswordResetTokenStatus(token)
    : ("invalid" as const);

  if (!token || status !== "valid") {
    return (
      <main className="bg-connect-paper text-connect-ink flex min-h-screen items-center justify-center px-5 py-8">
        <section className="border-connect-ink/15 bg-connect-surface w-full max-w-md rounded-md border p-8 text-center shadow-[10px_10px_0_var(--color-focus-on-dark)]">
          <div className="bg-connect-danger-soft text-connect-danger mx-auto flex h-12 w-12 items-center justify-center rounded-md">
            <X className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-3xl font-semibold">
            再設定リンクを確認できません
          </h1>
          <p className="text-connect-muted mt-4 leading-7">
            {status === "expired"
              ? "リンクの有効期限が切れています。もう一度リンクを発行してください。"
              : "リンクが無効です。もう一度リンクを発行してください。"}
          </p>
          <Link
            href="/auth/forgot-password"
            className="bg-connect-ink text-connect-paper mt-6 inline-flex min-h-12 items-center justify-center rounded-md px-5 font-semibold"
          >
            再設定リンクを発行
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="bg-connect-paper text-connect-ink flex min-h-screen items-center justify-center px-5 py-8">
      <section className="border-connect-ink/15 bg-connect-surface w-full max-w-md rounded-md border p-8 shadow-[10px_10px_0_var(--color-focus-on-dark)]">
        <div className="bg-connect-highlight text-connect-action flex h-12 w-12 items-center justify-center rounded-md">
          <KeyRound className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">新しいパスワードを入力</h1>
        <p className="text-connect-muted mt-4 leading-7">
          8文字以上、UTF-8で72バイト以内にしてください。
        </p>
        <ResetPasswordForm token={token} />
      </section>
    </main>
  );
}
