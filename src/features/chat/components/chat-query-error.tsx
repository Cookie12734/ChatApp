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
      className="mx-4 mt-4 flex flex-col gap-3 rounded-lg border border-[#cc5f2f]/30 bg-[#fff1e8] px-4 py-3 text-[#18221f] sm:flex-row sm:items-center sm:justify-between"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex min-w-0 items-start gap-3">
        <WifiOff
          className="mt-0.5 h-5 w-5 shrink-0 text-[#9f4122]"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-semibold">チャットに接続できませんでした</p>
          <p className="mt-1 text-sm leading-6 text-[#53615a]">
            入力内容はそのままです。接続を確認して、もう一度お試しください。
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void handleRetry()}
        disabled={isRetrying}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-[#18221f]/20 bg-white px-4 text-sm font-semibold text-[#18221f] transition hover:bg-[#f6f0e4] focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
