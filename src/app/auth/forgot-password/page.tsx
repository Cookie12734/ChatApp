import { KeyRound } from "lucide-react";

import { ForgotPasswordForm } from "~/features/auth/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="bg-connect-paper text-connect-ink flex min-h-screen items-center justify-center px-5 py-8">
      <section className="border-connect-ink/15 bg-connect-surface w-full max-w-md rounded-md border p-8 shadow-[10px_10px_0_var(--color-focus-on-dark)]">
        <div className="bg-connect-highlight text-connect-action flex h-12 w-12 items-center justify-center rounded-md">
          <KeyRound className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">パスワードを再設定する</h1>
        <p className="text-connect-muted mt-4 mb-6 leading-7">
          登録したメールアドレスへ再設定リンクを送ります。
        </p>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
