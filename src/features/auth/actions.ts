"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn } from "~/features/auth";
import { createAndSendVerificationToken } from "~/features/auth/lib/verification-token";
import { db } from "~/server/db";

export type AuthFormState = {
  error?: string;
};

const loginSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});

const signUpSchema = z
  .object({
    userId: z
      .string()
      .trim()
      .min(3, "ユーザーIDは3文字以上にしてください")
      .max(32, "ユーザーIDは32文字以内にしてください")
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "ユーザーIDは半角英数字とアンダースコアのみ使用できます",
      ),
    name: z.string().min(1, "名前を入力してください"),
    email: z.string().email("有効なメールアドレスを入力してください"),
    password: z.string().min(8, "パスワードは8文字以上にしてください"),
    confirmPassword: z.string().min(1, "パスワード（確認）を入力してください"),
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

  const normalizedEmail = parsed.data.email.trim();

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (user && !user.emailVerified) {
    return {
      error:
        "メールアドレスの確認が完了していません。確認メールのリンクをクリックしてください。",
    };
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

  redirect("/servers");
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
  const normalizedEmail = email.trim();
  const normalizedUserId = userId.trim();
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing?.emailVerified) {
    return { error: "このメールアドレスは既に登録されています" };
  }

  const existingUserId = await db.user.findFirst({
    where: {
      userId: normalizedUserId,
      NOT: { email: normalizedEmail },
    },
  });

  if (existingUserId) {
    return { error: "そのユーザーIDは既に使用されています" };
  }

  if (existing) {
    await db.user.update({
      where: { email: normalizedEmail },
      data: {
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
  } catch {
    return {
      error: "確認メールの送信に失敗しました。もう一度お試しください",
    };
  }

  redirect("/auth/verify-email/sent");
}
