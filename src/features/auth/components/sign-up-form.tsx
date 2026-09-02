"use client";

import { ArrowRight, Home } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { signUp, type AuthFormState } from "~/features/auth/actions";

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState<
    AuthFormState,
    FormData
  >(signUp, {});
  const [formValues, setFormValues] = useState({
    userId: "",
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const inputClass =
    "rounded-md border border-connect-ink/20 bg-connect-surface px-4 py-3 text-connect-ink placeholder:text-connect-placeholder";

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        {state.error && (
          <p
            className="border-connect-signal/25 bg-connect-danger-soft text-connect-danger rounded-md border px-4 py-3 text-sm"
            role="alert"
          >
            {state.error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label
            htmlFor="userId"
            className="text-connect-label text-left text-sm"
          >
            ユーザーID
          </label>
          <input
            id="userId"
            name="userId"
            type="text"
            required
            autoComplete="username"
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_]+"
            value={formValues.userId}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                userId: event.target.value,
              }))
            }
            placeholder="yamada_taro"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="name"
            className="text-connect-label text-left text-sm"
          >
            表示名
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={50}
            autoComplete="name"
            value={formValues.name}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder="山田 太郎"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="email"
            className="text-connect-label text-left text-sm"
          >
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            value={formValues.email}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="password"
            className="text-connect-label text-left text-sm"
          >
            パスワード
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            value={formValues.password}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                password: event.target.value,
              }))
            }
            placeholder="8文字以上"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="confirmPassword"
            className="text-connect-label text-left text-sm"
          >
            パスワード確認
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            value={formValues.confirmPassword}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                confirmPassword: event.target.value,
              }))
            }
            placeholder="もう一度入力"
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 font-semibold transition disabled:opacity-50"
        >
          {isPending ? "登録中..." : "アカウントを作成"}
          {!isPending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </form>

      <p className="text-connect-label text-center text-sm">
        すでにアカウントをお持ちの方は{" "}
        <Link
          href="/auth/login"
          className="text-connect-action font-semibold underline-offset-4 hover:underline"
        >
          ログイン
        </Link>
      </p>

      <Link
        href="/"
        className="text-connect-label hover:text-connect-ink inline-flex items-center justify-center gap-2 text-sm transition"
      >
        <Home className="h-4 w-4" aria-hidden="true" />
        トップへ戻る
      </Link>
    </div>
  );
}
