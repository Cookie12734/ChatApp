"use client";

import { ArrowRight } from "lucide-react";
import { useActionState } from "react";

import {
  resetPassword,
  type PasswordResetState,
} from "~/features/auth/actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState<
    PasswordResetState,
    FormData
  >(resetPassword, {});

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p
          className="border-connect-signal/25 bg-connect-danger-soft text-connect-danger rounded-md border px-4 py-3 text-sm"
          role="alert"
        >
          {state.error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-connect-label text-sm">
          新しいパスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          className="border-connect-ink/20 bg-connect-surface focus:border-connect-ink/35 focus:ring-connect-ink/10 rounded-md border px-4 py-3 focus:ring-2 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="confirmPassword" className="text-connect-label text-sm">
          パスワード確認
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          className="border-connect-ink/20 bg-connect-surface focus:border-connect-ink/35 focus:ring-connect-ink/10 rounded-md border px-4 py-3 focus:ring-2 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="bg-connect-ink text-connect-paper inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 font-semibold disabled:opacity-50"
      >
        {isPending ? "更新中..." : "パスワードを更新"}
        {!isPending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </button>
    </form>
  );
}
