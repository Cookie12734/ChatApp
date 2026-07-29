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
    "rounded-md border border-[#18221f]/20 bg-white px-4 py-3 text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none";

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        {state.error && (
          <p
            className="rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] px-4 py-3 text-sm text-[#9f4122]"
            role="alert"
          >
            {state.error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="userId" className="text-left text-sm text-[#5d665f]">
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
          <label htmlFor="name" className="text-left text-sm text-[#5d665f]">
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
          <label htmlFor="email" className="text-left text-sm text-[#5d665f]">
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
            className="text-left text-sm text-[#5d665f]"
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
            className="text-left text-sm text-[#5d665f]"
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
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 py-3 font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:opacity-50"
        >
          {isPending ? "登録中..." : "アカウントを作成"}
          {!isPending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </form>

      <p className="text-center text-sm text-[#5d665f]">
        すでにアカウントをお持ちの方は{" "}
        <Link
          href="/auth/login"
          className="font-semibold text-[#114744] underline-offset-4 hover:underline"
        >
          ログイン
        </Link>
      </p>

      <Link
        href="/"
        className="inline-flex items-center justify-center gap-2 text-sm text-[#5d665f] transition hover:text-[#18221f]"
      >
        <Home className="h-4 w-4" aria-hidden="true" />
        トップへ戻る
      </Link>
    </div>
  );
}
