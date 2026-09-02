"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";

import { confirmEmailToken, type VerifyEmailState } from "./actions";

export function VerifyEmailForm({ token }: { token: string }) {
  const confirmAction = confirmEmailToken.bind(null, token);
  const [state, formAction, isPending] = useActionState<
    VerifyEmailState,
    FormData
  >(confirmAction, {});

  return (
    <form action={formAction} className="mt-6 text-left">
      {state.error && (
        <p
          className="border-connect-danger/25 bg-connect-danger-soft text-connect-danger-deep mb-4 rounded-md border px-4 py-3 text-sm leading-6"
          role="alert"
        >
          {state.error}
        </p>
      )}
      <div className="mb-4 flex flex-col gap-2">
        <label htmlFor="password" className="text-connect-label text-sm">
          登録時のパスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="current-password"
          className="border-connect-ink/20 bg-connect-surface text-connect-ink focus:border-connect-ink/35 focus:ring-connect-ink/10 rounded-md border px-4 py-3 focus:ring-2 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-5 font-semibold transition disabled:cursor-wait disabled:opacity-50"
      >
        <Check className="h-5 w-5" aria-hidden="true" />
        {isPending ? "確認しています..." : "メールアドレスを確認する"}
      </button>
    </form>
  );
}
