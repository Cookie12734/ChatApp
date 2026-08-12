"use client";

import { ArrowRight, Home } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import {
  signInWithCredentials,
  signInWithDiscord,
  type AuthFormState,
} from "~/features/auth/actions";

export function LoginForm({
  callbackUrl = "/",
  hasDiscordProvider = false,
}: {
  callbackUrl?: string;
  hasDiscordProvider?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<
    AuthFormState,
    FormData
  >(signInWithCredentials, {});
  const [formValues, setFormValues] = useState({
    email: "",
    password: "",
  });

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
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
            className="border-connect-ink/20 bg-connect-surface text-connect-ink placeholder:text-connect-placeholder focus:border-connect-action focus:ring-connect-focus-soft rounded-md border px-4 py-3 focus:ring-2 focus:outline-none"
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
            maxLength={72}
            autoComplete="current-password"
            value={formValues.password}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                password: event.target.value,
              }))
            }
            placeholder="8文字以上"
            className="border-connect-ink/20 bg-connect-surface text-connect-ink placeholder:text-connect-placeholder focus:border-connect-action focus:ring-connect-focus-soft rounded-md border px-4 py-3 focus:ring-2 focus:outline-none"
          />
          <Link
            href="/auth/forgot-password"
            className="text-connect-action self-end text-sm font-semibold underline-offset-4 hover:underline"
          >
            パスワードを忘れた方
          </Link>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 font-semibold transition disabled:opacity-50"
        >
          {isPending ? "ログイン中..." : "ログイン"}
          {!isPending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </form>

      {hasDiscordProvider && (
        <form action={signInWithDiscord}>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <button
            type="submit"
            className="border-connect-ink/20 bg-connect-surface text-connect-ink hover:bg-connect-paper inline-flex w-full items-center justify-center rounded-md border px-4 py-3 font-semibold transition"
          >
            Discordでログイン
          </button>
        </form>
      )}

      <p className="text-connect-label text-center text-sm">
        アカウントをお持ちでない方は{" "}
        <Link
          href="/auth/signup"
          className="text-connect-action font-semibold underline-offset-4 hover:underline"
        >
          はじめる
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
