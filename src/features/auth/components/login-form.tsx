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
            className="rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] px-4 py-3 text-sm text-[#9f4122]"
            role="alert"
          >
            {state.error}
          </p>
        )}

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
            className="rounded-md border border-[#18221f]/20 bg-white px-4 py-3 text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
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
            className="rounded-md border border-[#18221f]/20 bg-white px-4 py-3 text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
          />
          <Link
            href="/auth/forgot-password"
            className="self-end text-sm font-semibold text-[#114744] underline-offset-4 hover:underline"
          >
            パスワードを忘れた方
          </Link>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 py-3 font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:opacity-50"
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
            className="inline-flex w-full items-center justify-center rounded-md border border-[#18221f]/20 bg-white px-4 py-3 font-semibold text-[#18221f] transition hover:bg-[#f6f0e4]"
          >
            Discordでログイン
          </button>
        </form>
      )}

      <p className="text-center text-sm text-[#5d665f]">
        アカウントをお持ちでない方は{" "}
        <Link
          href="/auth/signup"
          className="font-semibold text-[#114744] underline-offset-4 hover:underline"
        >
          はじめる
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
