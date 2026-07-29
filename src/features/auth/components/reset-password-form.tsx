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
          className="rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] px-4 py-3 text-sm text-[#9f4122]"
          role="alert"
        >
          {state.error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm text-[#5d665f]">
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
          className="rounded-md border border-[#18221f]/20 bg-white px-4 py-3 focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="confirmPassword" className="text-sm text-[#5d665f]">
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
          className="rounded-md border border-[#18221f]/20 bg-white px-4 py-3 focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 py-3 font-semibold text-[#f6f0e4] disabled:opacity-50"
      >
        {isPending ? "更新中..." : "パスワードを更新"}
        {!isPending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </button>
    </form>
  );
}
