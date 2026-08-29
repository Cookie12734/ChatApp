"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import {
  requestPasswordReset,
  type PasswordResetState,
} from "~/features/auth/actions";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState<
    PasswordResetState,
    FormData
  >(requestPasswordReset, {});

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-4">
        {state.message && (
          <p
            className="border-connect-action/20 bg-connect-highlight text-connect-action rounded-md border px-4 py-3 text-sm"
            role="status"
          >
            {state.message}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-connect-label text-sm">
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            className="border-connect-ink/20 bg-connect-surface focus:border-connect-action focus:ring-connect-focus-soft rounded-md border px-4 py-3 focus:ring-2 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="bg-connect-ink text-connect-paper inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 font-semibold disabled:opacity-50"
        >
          {isPending ? "送信中..." : "再設定リンクを送る"}
          {!isPending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </form>
      <Link
        href="/auth/login"
        className="text-connect-action text-center text-sm font-semibold underline-offset-4 hover:underline"
      >
        ログインへ戻る
      </Link>
    </div>
  );
}
