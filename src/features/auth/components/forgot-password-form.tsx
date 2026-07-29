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
            className="rounded-md border border-[#114744]/20 bg-[#e4f2dc] px-4 py-3 text-sm text-[#114744]"
            role="status"
          >
            {state.message}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm text-[#5d665f]">
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            className="rounded-md border border-[#18221f]/20 bg-white px-4 py-3 focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 py-3 font-semibold text-[#f6f0e4] disabled:opacity-50"
        >
          {isPending ? "送信中..." : "再設定リンクを送る"}
          {!isPending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </form>
      <Link
        href="/auth/login"
        className="text-center text-sm font-semibold text-[#114744] underline-offset-4 hover:underline"
      >
        ログインへ戻る
      </Link>
    </div>
  );
}
