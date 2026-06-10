"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp, type AuthFormState } from "~/features/auth/actions";

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(
    signUp,
    {},
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        {state.error && (
          <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {state.error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-left text-sm text-zinc-400">
            ユーザー名
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="山田 太郎"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-left text-sm text-zinc-400">
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-left text-sm text-zinc-400">
            パスワード
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            placeholder="8文字以上"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="confirmPassword"
            className="text-left text-sm text-zinc-400"
          >
            パスワード（確認）
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            placeholder="もう一度入力"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-white px-4 py-3 font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
        >
          {isPending ? "登録中..." : "アカウントを作成"}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-500">
        すでにアカウントをお持ちの方は{" "}
        <Link
          href="/auth/login"
          className="text-white underline-offset-4 hover:underline"
        >
          ログイン
        </Link>
      </p>

      <Link
        href="/"
        className="text-center text-sm text-zinc-500 transition hover:text-zinc-300"
      >
        トップに戻る
      </Link>
    </div>
  );
}
