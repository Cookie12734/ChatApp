"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn } from "~/features/auth";
import { findUserByNormalizedEmail } from "~/features/auth/lib/email-user";
import {
  clearPendingVerificationEmail,
  getPendingVerificationEmailSession,
  rememberVerificationEmailSent,
  VERIFICATION_EMAIL_RESEND_COOLDOWN_SECONDS,
} from "~/features/auth/lib/verification-email-session";
import { createAndSendVerificationToken } from "~/features/auth/lib/verification-token";
import { db } from "~/server/db";

export type AuthFormState = {
  error?: string;
};

export type ResendVerificationEmailState = {
  error?: string;
  message?: string;
  remainingSeconds?: number;
};

const userIdSchema = z
  .string()
  .trim()
  .min(3, "ユーザーIDは3文字以上で入力してください")
  .max(32, "ユーザーIDは32文字以内で入力してください")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "ユーザーIDは半角英数字とアンダースコアのみ使用できます",
  );

const loginSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});

const signUpSchema = z
  .object({
    userId: userIdSchema,
    name: z.string().min(1, "表示名を入力してください"),
    email: z.string().email("有効なメールアドレスを入力してください"),
    password: z.string().min(8, "パスワードは8文字以上にしてください"),
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
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "入力内容を確認してください",
    };
  }

  const { isAmbiguous, normalizedEmail, user } =
    await findUserByNormalizedEmail(parsed.data.email);

  if (isAmbiguous) {
    return {
      error: "メールアドレスまたはパスワードが正しくありません",
    };
  }

  if (user && !user.emailVerified) {
    const isValidPassword = user.passwordHash
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : false;

    if (!isValidPassword) {
      return {
        error: "メールアドレスまたはパスワードが正しくありません",
      };
    }

    try {
      if (user.email !== normalizedEmail) {
        await db.user.update({
          where: { id: user.id },
          data: { email: normalizedEmail },
        });
      }

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
    if (error instanceof AuthError && error.type === "CredentialsSignin") {
      return {
        error: "メールアドレスまたはパスワードが正しくありません",
      };
    }

    throw error;
  }

  redirect("/");
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
  const {
    isAmbiguous,
    normalizedEmail,
    user: existing,
  } = await findUserByNormalizedEmail(email);
  const normalizedUserId = userId.trim();
  const passwordHash = await bcrypt.hash(password, 12);

  if (isAmbiguous || existing?.emailVerified) {
    return {
      error: "このメールアドレスはすでに登録されています",
    };
  }

  const existingUserId = await db.user.findFirst({
    where: {
      userId: normalizedUserId,
      ...(existing ? { NOT: { id: existing.id } } : {}),
    },
  });

  if (existingUserId) {
    return { error: "そのユーザーIDはすでに使用されています" };
  }

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        email: normalizedEmail,
        userId: normalizedUserId,
        name: name.trim(),
        passwordHash,
      },
    });
  } else {
    await db.user.create({
      data: {
        userId: normalizedUserId,
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        emailVerified: null,
      },
    });
  }

  try {
    await createAndSendVerificationToken(normalizedEmail);
    await rememberVerificationEmailSent(normalizedEmail);
  } catch {
    return {
      error: "確認メールの送信に失敗しました。もう一度お試しください",
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
      error: "再送するメールアドレスが見つかりません。もう一度登録してください",
    };
  }

  const { isAmbiguous, normalizedEmail, user } =
    await findUserByNormalizedEmail(pendingSession.email);

  if (pendingSession.remainingSeconds > 0) {
    return {
      error: "まだ再送できません",
      remainingSeconds: pendingSession.remainingSeconds,
    };
  }

  if (isAmbiguous || !user) {
    await clearPendingVerificationEmail();

    return {
      error: "登録情報が見つかりません。もう一度登録してください",
    };
  }

  if (user.emailVerified) {
    await clearPendingVerificationEmail();

    return {
      message: "メールアドレスはすでに確認済みです。ログインしてください",
    };
  }

  try {
    if (user.email !== normalizedEmail) {
      await db.user.update({
        where: { id: user.id },
        data: { email: normalizedEmail },
      });
    }

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
