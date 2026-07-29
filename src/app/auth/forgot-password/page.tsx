import { KeyRound } from "lucide-react";

import { ForgotPasswordForm } from "~/features/auth/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f0e4] px-5 py-8 text-[#18221f]">
      <section className="w-full max-w-md rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-8 shadow-[10px_10px_0_#d8efee]">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#e4f2dc] text-[#114744]">
          <KeyRound className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">パスワードを再設定する</h1>
        <p className="mt-4 mb-6 leading-7 text-[#53615a]">
          登録したメールアドレスへ再設定リンクを送ります。
        </p>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
