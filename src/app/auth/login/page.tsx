import { MessageCircle } from "lucide-react";
import { redirect } from "next/navigation";

import { env } from "~/env";
import { auth } from "~/features/auth";
import { LoginForm } from "~/features/auth/components/login-form";
import { getSafeInternalRedirect } from "~/features/auth/lib/redirect-path";

type LoginPageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
    deleted?: string;
    reason?: string;
    reset?: string;
    verified?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  const { callbackUrl, deleted, reason, reset, verified } = await searchParams;
  const redirectTo = getSafeInternalRedirect(callbackUrl);
  const statusMessage =
    verified === "1"
      ? "メールアドレスの確認が完了しました。ログインしてください。"
      : reset === "1"
        ? "パスワードを更新しました"
        : deleted === "1"
          ? "アカウントを削除しました"
          : null;

  if (session?.user?.id) {
    redirect(redirectTo);
  }

  return (
    <main className="bg-connect-paper text-connect-ink min-h-screen px-5 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="max-w-lg">
          <div className="bg-connect-ink text-connect-paper mb-6 flex h-12 w-12 items-center justify-center rounded-md">
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-connect-danger mb-4 text-sm font-semibold uppercase">
            connect
          </p>
          <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">
            続きから、
            <br />
            静かに戻る。
          </h1>
          <p className="text-connect-muted mt-5 leading-8">
            ログインすると、チャットとフレンドの通知へ戻れます。
          </p>
          {statusMessage && (
            <p
              className="border-connect-action/20 bg-connect-highlight text-connect-action mt-6 rounded-md border px-4 py-3 text-sm"
              role="status"
            >
              {statusMessage}
            </p>
          )}
          {reason === "session_expired" && (
            <p
              className="border-connect-danger/20 bg-connect-danger-soft text-connect-danger-deep mt-6 rounded-md border px-4 py-3 text-sm"
              role="status"
            >
              セッションの有効期限が切れました。もう一度ログインしてください。
            </p>
          )}
        </section>

        <section className="border-connect-ink/15 bg-connect-surface rounded-md border p-6 shadow-[10px_10px_0_var(--color-focus-on-dark)] sm:p-8">
          <h2 className="mb-6 text-2xl font-semibold">ログイン</h2>
          <LoginForm
            callbackUrl={redirectTo}
            hasDiscordProvider={Boolean(
              env.AUTH_DISCORD_ID && env.AUTH_DISCORD_SECRET,
            )}
          />
        </section>
      </div>
    </main>
  );
}
