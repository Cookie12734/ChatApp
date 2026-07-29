"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  getEmailVerificationCommitRateLimitRules,
  isBcryptPasswordSupported,
} from "~/features/auth/lib/credential-policy";
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
  formData: FormData,
): Promise<VerifyEmailState> {
  const password = z
    .string()
    .min(8)
    .refine(isBcryptPasswordSupported)
    .safeParse(formData.get("password"));

  if (!password.success) {
    return { error: "確認リンクまたはパスワードが正しくありません" };
  }

  try {
    await enforceRateLimits(
      getEmailVerificationCommitRateLimitRules(
        token,
        await getRequestRateLimitSubject(),
      ),
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return { error: getRateLimitMessage(error) };
    }

    throw error;
  }

  const result = await verifyEmailToken(token, password.data);

  if (!result.success) {
    const error =
      result.reason === "expired"
        ? "確認リンクの有効期限が切れています。登録時の情報でログインすると再送できます"
        : result.reason === "legacy"
          ? "以前の確認リンクは無効になりました。新規登録から登録し直してください"
          : result.reason === "conflict"
            ? "メールアドレスまたはユーザーIDはすでに使用されています。新規登録の内容を確認してください"
            : "確認リンクまたはパスワードが正しくありません";

    return {
      error,
    };
  }

  redirect("/auth/login?verified=1");
}
