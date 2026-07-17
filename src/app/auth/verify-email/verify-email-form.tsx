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
    <form action={formAction} className="mt-6">
      {state.error && (
        <p
          className="mb-4 rounded-md border border-[#9f4122]/25 bg-[#fff1e8] px-4 py-3 text-sm leading-6 text-[#8c351c]"
          role="alert"
        >
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#18221f] px-5 font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:cursor-wait disabled:opacity-50"
      >
        <Check className="h-5 w-5" aria-hidden="true" />
        {isPending ? "確認しています..." : "メールアドレスを確認する"}
      </button>
    </form>
  );
}
