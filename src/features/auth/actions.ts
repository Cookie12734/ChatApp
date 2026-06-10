"use server";

import bcrypt from "bcryptjs";
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
    return { error: parsed.error.errors[0]?.message ?? "入力内容を確認してください" };
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

  const result = (await signIn("credentials", {
    email: normalizedEmail,
    password: parsed.data.password,
    redirect: false,
  })) as { error?: string } | undefined;

  if (result?.error) {
    return { error: "メールアドレスまたはパスワードが正しくありません" };
  }

  redirect("/");
}

export async function signUp(
  _prevState: AuthFormState | null,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "入力内容を確認してください" };
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.trim();
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing?.emailVerified) {
    return { error: "このメールアドレスは既に登録されています" };
  }

  if (existing) {
    await db.user.update({
      where: { email: normalizedEmail },
      data: {
        name: name.trim(),
        passwordHash,
      },
    });
  } else {
    await db.user.create({
      data: {
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
    return { error: "確認メールの送信に失敗しました。もう一度お試しください" };
  }

  redirect("/auth/verify-email/sent");
}
