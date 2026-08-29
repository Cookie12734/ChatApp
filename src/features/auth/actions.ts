"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { auth, signIn, signOut } from "~/features/auth";
import {
  getCredentialsLoginRateLimitRules,
  getPasswordResetIdentifier,
  getPasswordResetCommitRateLimitRules,
  getPasswordResetRequestRateLimitRules,
  getSignupRateLimitRules,
  getVerificationEmailRateLimitRules,
  isBcryptPasswordSupported,
  isReplaceableLegacyRegistration,
} from "~/features/auth/lib/credential-policy";
import { normalizeEmailAddress } from "~/features/auth/lib/email-normalization";
import { findUserByNormalizedEmail } from "~/features/auth/lib/email-user";
import {
  consumePasswordResetToken,
  createAndSendPasswordResetToken,
  getPasswordResetTokenStatus,
} from "~/features/auth/lib/password-reset";
import { getSafeInternalRedirect } from "~/features/auth/lib/redirect-path";
import { userIdSchema } from "~/lib/input";
import {
  clearPendingVerificationEmail,
  getPendingVerificationEmailSession,
  rememberVerificationEmailSent,
  VERIFICATION_EMAIL_RESEND_COOLDOWN_SECONDS,
} from "~/features/auth/lib/verification-email-session";
import {
  createAndSendPendingRegistration,
  createAndSendVerificationToken,
} from "~/features/auth/lib/verification-token";
import { db } from "~/server/db";
import {
  getRateLimitMessage,
  RateLimitExceededError,
  type RateLimitRule,
} from "~/server/rate-limit-policy";
import {
  enforceRateLimits,
  getRequestRateLimitSubject,
} from "~/server/rate-limit";

export type AuthFormState = {
  error?: string;
};

export type ResendVerificationEmailState = {
  error?: string;
  message?: string;
  remainingSeconds?: number;
};

export type PasswordResetState = {
  error?: string;
  message?: string;
};

export type DeleteAccountState = {
  error?: string;
};

const PASSWORD_RESET_REQUEST_MESSAGE =
  "登録済みのメールアドレスの場合、再設定リンクを送信しました";

async function getRateLimitError(rules: RateLimitRule[]) {
  try {
    await enforceRateLimits(rules);
    return null;
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return getRateLimitMessage(error);
    }

    throw error;
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002"
  );
}

const loginSchema = z.object({
  email: z
    .string()
    .email("有効なメールアドレスを入力してください")
    .max(320, "メールアドレスが長すぎます"),
  password: z
    .string()
    .min(1, "パスワードを入力してください")
    .refine(
      isBcryptPasswordSupported,
      "パスワードはUTF-8で72バイト以内にしてください",
    ),
});

const signUpSchema = z
  .object({
    userId: userIdSchema,
    name: z
      .string()
      .trim()
      .min(1, "表示名を入力してください")
      .max(50, "表示名は50文字以内で入力してください"),
    email: z
      .string()
      .email("有効なメールアドレスを入力してください")
      .max(320, "メールアドレスが長すぎます"),
    password: z
      .string()
      .min(8, "パスワードは8文字以上にしてください")
      .refine(
        isBcryptPasswordSupported,
        "パスワードはUTF-8で72バイト以内にしてください",
      ),
    confirmPassword: z.string().min(1, "確認用のパスワードを入力してください"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });

const resetPasswordSchema = z
  .object({
    token: z.string().min(1).max(128),
    password: z
      .string()
      .min(8, "パスワードは8文字以上にしてください")
      .refine(
        isBcryptPasswordSupported,
        "パスワードはUTF-8で72バイト以内にしてください",
      ),
    confirmPassword: z.string().min(1, "確認用のパスワードを入力してください"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });

export async function signInWithCredentials(
  _prevState: AuthFormState | null,
  formData: FormData,
): Promise<AuthFormState> {
  const redirectTo = getSafeInternalRedirect(formData.get("callbackUrl"));
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "入力内容を確認してください",
    };
  }

  const normalizedInputEmail = normalizeEmailAddress(parsed.data.email);
  const { isAmbiguous, normalizedEmail, user } =
    await findUserByNormalizedEmail(parsed.data.email);

  if (isAmbiguous) {
    return {
      error: "メールアドレスまたはパスワードが正しくありません",
    };
  }

  const pendingRegistration = user
    ? null
    : await db.pendingRegistration.findUnique({
        where: { email: normalizedEmail },
        select: { passwordHash: true },
      });
  const verificationPasswordHash =
    user && !user.emailVerified
      ? user.passwordHash
      : pendingRegistration?.passwordHash;

  if (verificationPasswordHash) {
    const requestSubject = await getRequestRateLimitSubject();
    const rateLimitError = await getRateLimitError(
      getCredentialsLoginRateLimitRules(normalizedInputEmail, requestSubject),
    );

    if (rateLimitError) {
      return { error: rateLimitError };
    }

    const isValidPassword = await bcrypt.compare(
      parsed.data.password,
      verificationPasswordHash,
    );

    if (!isValidPassword) {
      return {
        error: "メールアドレスまたはパスワードが正しくありません",
      };
    }

    if (user) {
      return {
        error:
          "この確認前アカウントは登録し直す必要があります。新規登録から同じメールアドレスで手続きしてください",
      };
    }

    const verificationRateLimitError = await getRateLimitError(
      getVerificationEmailRateLimitRules(normalizedEmail, requestSubject),
    );

    if (verificationRateLimitError) {
      return { error: verificationRateLimitError };
    }

    try {
      await createAndSendVerificationToken(normalizedEmail);
      await rememberVerificationEmailSent(normalizedEmail);
    } catch {
      return {
        error:
          "確認メールの送信に失敗しました。時間をおいてもう一度お試しください",
      };
    }

    redirect("/auth/verify-email/sent");
  }

  try {
    await signIn("credentials", {
      email: normalizedEmail,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (
      error instanceof AuthError &&
      error.type === "CredentialsSignin" &&
      "retryAfterSeconds" in error &&
      typeof error.retryAfterSeconds === "number"
    ) {
      return {
        error: getRateLimitMessage(
          new RateLimitExceededError(error.retryAfterSeconds),
        ),
      };
    }

    if (error instanceof AuthError && error.type === "CredentialsSignin") {
      return {
        error: "メールアドレスまたはパスワードが正しくありません",
      };
    }

    throw error;
  }

  redirect(redirectTo);
}

export async function signInWithDiscord(formData: FormData): Promise<void> {
  await signIn("discord", {
    redirectTo: getSafeInternalRedirect(formData.get("callbackUrl")),
  });
}

export async function signUp(
  _prevState: AuthFormState | null,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "入力内容を確認してください",
    };
  }

  const { userId, name, email, password } = parsed.data;
  const normalizedInputEmail = normalizeEmailAddress(email);
  const requestSubject = await getRequestRateLimitSubject();
  const rateLimitError = await getRateLimitError(
    getSignupRateLimitRules(normalizedInputEmail, requestSubject),
  );

  if (rateLimitError) {
    return { error: rateLimitError };
  }

  const {
    isAmbiguous,
    normalizedEmail,
    user: existing,
  } = await findUserByNormalizedEmail(email);
  const normalizedUserId = userId.trim();

  if (isAmbiguous) {
    return {
      error: "このメールアドレスはすでに登録されています",
    };
  }

  if (existing) {
    const legacyRegistration = await db.user.findUnique({
      where: { id: existing.id },
      select: {
        emailVerified: true,
        passwordHash: true,
        _count: { select: { accounts: true, sessions: true } },
      },
    });

    if (
      !legacyRegistration ||
      !isReplaceableLegacyRegistration({
        accountCount: legacyRegistration._count.accounts,
        emailVerified: legacyRegistration.emailVerified,
        passwordHash: legacyRegistration.passwordHash,
        sessionCount: legacyRegistration._count.sessions,
      })
    ) {
      return { error: "このメールアドレスはすでに登録されています" };
    }

    const replaced = await db.$transaction(async (transaction) => {
      const deleted = await transaction.user.deleteMany({
        where: {
          id: existing.id,
          accounts: { none: {} },
          emailVerified: null,
          passwordHash: { not: null },
          sessions: { none: {} },
        },
      });

      if (deleted.count !== 1) {
        return false;
      }

      await transaction.verificationToken.deleteMany({
        where: { identifier: normalizedEmail },
      });
      return true;
    });

    if (!replaced) {
      return {
        error: "登録状態が更新されました。内容を確認してもう一度お試しください",
      };
    }
  }

  const existingUserId = await db.user.findFirst({
    where: { userId: normalizedUserId },
    select: { id: true },
  });

  if (existingUserId) {
    return { error: "そのユーザーIDはすでに使用されています" };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await createAndSendPendingRegistration({
      email: normalizedEmail,
      name,
      passwordHash,
      userId: normalizedUserId,
    });
    await rememberVerificationEmailSent(normalizedEmail);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        error:
          "入力されたメールアドレスまたはユーザーIDはすでに使用されています",
      };
    }

    return {
      error:
        "確認メールの送信に失敗しました。ログイン画面で同じメールアドレスとパスワードを入力すると再送できます",
    };
  }

  redirect("/auth/verify-email/sent");
}

export async function resendVerificationEmail(
  _prevState: ResendVerificationEmailState | null,
  _formData: FormData,
): Promise<ResendVerificationEmailState> {
  const pendingSession = await getPendingVerificationEmailSession();

  if (!pendingSession.email) {
    return {
      error:
        "再送するメールアドレスが見つかりません。ログイン画面で登録時の情報を入力してください",
    };
  }

  const { isAmbiguous, normalizedEmail, user } =
    await findUserByNormalizedEmail(pendingSession.email);
  const pendingRegistration = await db.pendingRegistration.findUnique({
    where: { email: normalizedEmail },
    select: { email: true },
  });

  if (pendingSession.remainingSeconds > 0) {
    return {
      error: "まだ再送できません",
      remainingSeconds: pendingSession.remainingSeconds,
    };
  }

  const requestSubject = await getRequestRateLimitSubject();
  const rateLimitError = await getRateLimitError(
    getVerificationEmailRateLimitRules(normalizedEmail, requestSubject),
  );

  if (rateLimitError) {
    return { error: rateLimitError };
  }

  if (isAmbiguous || (!user && !pendingRegistration)) {
    await clearPendingVerificationEmail();

    return {
      error: "登録情報が見つかりません。もう一度登録してください",
    };
  }

  if (user?.emailVerified) {
    await db.pendingRegistration.deleteMany({
      where: { email: normalizedEmail },
    });
    await clearPendingVerificationEmail();

    return {
      message: "メールアドレスはすでに確認済みです。ログインしてください",
    };
  }

  if (user) {
    await clearPendingVerificationEmail();

    return {
      error:
        "この確認前アカウントは登録し直す必要があります。新規登録から手続きしてください",
    };
  }

  try {
    await createAndSendVerificationToken(normalizedEmail);
    await rememberVerificationEmailSent(normalizedEmail);
  } catch {
    return {
      error:
        "確認メールの再送に失敗しました。時間をおいてもう一度お試しください",
    };
  }

  return {
    message: "確認メールを再送しました",
    remainingSeconds: VERIFICATION_EMAIL_RESEND_COOLDOWN_SECONDS,
  };
}

export async function requestPasswordReset(
  _prevState: PasswordResetState | null,
  formData: FormData,
): Promise<PasswordResetState> {
  const parsed = loginSchema.shape.email.safeParse(formData.get("email"));

  if (!parsed.success) {
    return { message: PASSWORD_RESET_REQUEST_MESSAGE };
  }

  const normalizedEmail = normalizeEmailAddress(parsed.data);

  try {
    await enforceRateLimits(
      getPasswordResetRequestRateLimitRules(
        normalizedEmail,
        await getRequestRateLimitSubject(),
      ),
    );

    const { isAmbiguous, user } =
      await findUserByNormalizedEmail(normalizedEmail);

    if (!isAmbiguous && user?.emailVerified && user.passwordHash) {
      after(async () => {
        try {
          await createAndSendPasswordResetToken(normalizedEmail);
        } catch {
          // Delivery failures must not change the enumeration-safe response.
        }
      });
    }
  } catch {
    // Account existence and delivery failures intentionally share one response.
  }

  return { message: PASSWORD_RESET_REQUEST_MESSAGE };
}

export async function resetPassword(
  _prevState: PasswordResetState | null,
  formData: FormData,
): Promise<PasswordResetState> {
  const parsed = resetPasswordSchema.safeParse({
    confirmPassword: formData.get("confirmPassword"),
    password: formData.get("password"),
    token: formData.get("token"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "入力内容を確認してください",
    };
  }

  const rateLimitError = await getRateLimitError(
    getPasswordResetCommitRateLimitRules(
      parsed.data.token,
      await getRequestRateLimitSubject(),
    ),
  );

  if (rateLimitError) {
    return { error: rateLimitError };
  }

  const status = await getPasswordResetTokenStatus(parsed.data.token);

  if (status !== "valid") {
    return {
      error:
        status === "expired"
          ? "再設定リンクの有効期限が切れています"
          : "再設定リンクが無効です",
    };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const result = await consumePasswordResetToken(
    parsed.data.token,
    passwordHash,
  );

  if (!result.success) {
    return {
      error:
        result.reason === "expired"
          ? "再設定リンクの有効期限が切れています"
          : "再設定リンクが無効です",
    };
  }

  redirect("/auth/login?reset=1");
}

export async function deleteAccount(
  _prevState: DeleteAccountState | null,
  formData: FormData,
): Promise<DeleteAccountState> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const confirmation = z
    .string()
    .trim()
    .min(1)
    .safeParse(formData.get("userId"));

  if (!confirmation.success) {
    return { error: "確認のため現在のユーザーIDを入力してください" };
  }

  const deletionResult = await db.$transaction(async (transaction) => {
    const lockedUser = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${session.user.id}
      FOR UPDATE
    `;

    if (!lockedUser[0]) {
      return "missing" as const;
    }

    const user = await transaction.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        userId: true,
        createdServers: { select: { id: true }, take: 1 },
        serverMemberships: {
          where: { role: "OWNER" },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!user) {
      return "missing" as const;
    }
    if (confirmation.data !== user.userId) {
      return "mismatch" as const;
    }
    if (user.createdServers.length || user.serverMemberships.length) {
      return "owns-server" as const;
    }

    await transaction.user.delete({ where: { id: session.user.id } });

    if (user.email) {
      const normalizedEmail = normalizeEmailAddress(user.email);
      await transaction.pendingRegistration.deleteMany({
        where: { email: normalizedEmail },
      });
      await transaction.verificationToken.deleteMany({
        where: {
          identifier: {
            in: [normalizedEmail, getPasswordResetIdentifier(normalizedEmail)],
          },
        },
      });
    }

    return "deleted" as const;
  });

  if (deletionResult === "missing") {
    return { error: "アカウントが見つかりません" };
  }
  if (deletionResult === "mismatch") {
    return { error: "ユーザーIDが一致しません" };
  }
  if (deletionResult === "owns-server") {
    return {
      error:
        "所有中のサーバーがあります。先に所有権を移譲するかサーバーを削除してください",
    };
  }

  await signOut({ redirectTo: "/auth/login?deleted=1" });
  return {};
}
