"use server";

import { redirect } from "next/navigation";

import { verifyEmailToken } from "~/features/auth/lib/verification-token";
import {
  getRateLimitMessage,
  RateLimitExceededError,
} from "~/server/rate-limit-policy";
import {
  enforceRateLimits,
  getRequestRateLimitSubject,
} from "~/server/rate-limit";

export type VerifyEmailState = {
  error?: string;
};

export async function confirmEmailToken(
  token: string,
  _previousState: VerifyEmailState,
  _formData: FormData,
): Promise<VerifyEmailState> {
  try {
    await enforceRateLimits([
      {
        limit: 20,
        scope: "auth:verify-token:address",
        subject: await getRequestRateLimitSubject(),
        windowMs: 15 * 60 * 1000,
      },
    ]);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return { error: getRateLimitMessage(error) };
    }

    throw error;
  }

  const result = await verifyEmailToken(token);

  if (!result.success) {
    return {
      error:
        result.reason === "expired"
          ? "確認リンクの有効期限が切れています。もう一度登録をお試しください"
          : "確認リンクが無効です。もう一度登録をお試しください",
    };
  }

  redirect("/auth/login?verified=1");
}
