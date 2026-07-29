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
      <main className="flex min-h-screen items-center justify-center bg-[#f6f0e4] px-5 py-8 text-[#18221f]">
        <section className="w-full max-w-md rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-8 text-center shadow-[10px_10px_0_#d8efee]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-[#fff1e8] text-[#9f4122]">
            <X className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-3xl font-semibold">
            再設定リンクを確認できません
          </h1>
          <p className="mt-4 leading-7 text-[#53615a]">
            {status === "expired"
              ? "リンクの有効期限が切れています。もう一度リンクを発行してください。"
              : "リンクが無効です。もう一度リンクを発行してください。"}
          </p>
          <Link
            href="/auth/forgot-password"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-[#18221f] px-5 font-semibold text-[#f6f0e4]"
          >
            再設定リンクを発行
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f0e4] px-5 py-8 text-[#18221f]">
      <section className="w-full max-w-md rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-8 shadow-[10px_10px_0_#d8efee]">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#e4f2dc] text-[#114744]">
          <KeyRound className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">新しいパスワードを入力</h1>
        <p className="mt-4 leading-7 text-[#53615a]">
          8文字以上、UTF-8で72バイト以内にしてください。
        </p>
        <ResetPasswordForm token={token} />
      </section>
    </main>
  );
}
