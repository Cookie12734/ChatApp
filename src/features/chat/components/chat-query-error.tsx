"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useState } from "react";

type ChatQueryErrorProps = {
  onRetry: () => Promise<unknown>;
};

export function ChatQueryError({ onRetry }: ChatQueryErrorProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);

    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      className="border-connect-signal/30 bg-connect-danger-soft text-connect-ink mx-4 mt-4 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex min-w-0 items-start gap-3">
        <WifiOff
          className="text-connect-danger mt-0.5 h-5 w-5 shrink-0"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-semibold">チャットに接続できませんでした</p>
          <p className="text-connect-muted mt-1 text-sm leading-6">
            入力内容はそのままです。接続を確認して、もう一度お試しください。
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void handleRetry()}
        disabled={isRetrying}
        className="border-connect-ink/20 bg-connect-surface text-connect-ink hover:bg-connect-paper focus-visible:ring-connect-action inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw
          className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {isRetrying ? "再接続中" : "再接続"}
      </button>
    </div>
  );
}
