"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import {
  resendVerificationEmail,
  type ResendVerificationEmailState,
} from "~/features/auth/actions";

type ResendVerificationEmailFormProps = {
  hasPendingEmail: boolean;
  initialRemainingSeconds: number;
};

export function ResendVerificationEmailForm({
  hasPendingEmail,
  initialRemainingSeconds,
}: ResendVerificationEmailFormProps) {
  const [state, formAction, isPending] = useActionState<
    ResendVerificationEmailState,
    FormData
  >(resendVerificationEmail, {
    remainingSeconds: initialRemainingSeconds,
  });
  const [remainingSeconds, setRemainingSeconds] = useState(
    initialRemainingSeconds,
  );

  useEffect(() => {
    if (typeof state.remainingSeconds === "number") {
      setRemainingSeconds(Math.max(state.remainingSeconds, 0));
    }
  }, [state.remainingSeconds]);

  useEffect(() => {
    if (remainingSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setRemainingSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [remainingSeconds]);

  const isCoolingDown = remainingSeconds > 0;
  const isDisabled = !hasPendingEmail || isPending || isCoolingDown;

  return (
    <form action={formAction} className="mt-6 flex flex-col items-center gap-3">
      <button
        type="submit"
        disabled={isDisabled}
        className="border-connect-ink/20 bg-connect-surface text-connect-ink hover:bg-connect-success-soft disabled:border-connect-disabled-border disabled:bg-connect-disabled-surface disabled:text-connect-disabled-text inline-flex items-center justify-center gap-2 rounded-md border px-5 py-3 font-semibold transition disabled:cursor-not-allowed"
      >
        <RefreshCw
          className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {isPending ? "再送中..." : "メールを再送"}
      </button>

      <p className="text-connect-quiet-text min-h-5 text-sm" aria-live="polite">
        {!hasPendingEmail
          ? "再送するには、もう一度登録またはログインしてください"
          : isCoolingDown
            ? `再送まであと ${remainingSeconds}秒`
            : "メールが届かない場合は再送できます"}
      </p>

      {state.message && (
        <p
          className="text-connect-action text-sm font-medium"
          aria-live="polite"
        >
          {state.message}
        </p>
      )}

      {state.error && (
        <p
          className="text-connect-danger text-sm font-medium"
          aria-live="polite"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
