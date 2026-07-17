import { MessageCircle } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { LoginForm } from "~/features/auth/components/login-form";
import { getSafeInternalRedirect } from "~/features/auth/lib/redirect-path";

type LoginPageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
    reason?: string;
    verified?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  const { callbackUrl, reason, verified } = await searchParams;
  const redirectTo = getSafeInternalRedirect(callbackUrl);

  if (session?.user?.id) {
    redirect(redirectTo);
  }

  return (
    <main className="min-h-screen bg-[#f6f0e4] px-5 py-8 text-[#18221f]">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="max-w-lg">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4]">
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mb-4 text-sm font-semibold text-[#9f4122] uppercase">
            connect
          </p>
          <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">
            続きから、
            <br />
            静かに戻る。
          </h1>
          <p className="mt-5 leading-8 text-[#53615a]">
            ログインすると、チャットとフレンドの通知へ戻れます。
          </p>
          {verified === "1" && (
            <p className="mt-6 rounded-md border border-[#114744]/20 bg-[#e4f2dc] px-4 py-3 text-sm text-[#114744]">
              メールアドレスの確認が完了しました。ログインしてください。
            </p>
          )}
          {reason === "session_expired" && (
            <p
              className="mt-6 rounded-md border border-[#9f4122]/20 bg-[#fff1e8] px-4 py-3 text-sm text-[#8c351c]"
              role="status"
            >
              セッションの有効期限が切れました。もう一度ログインしてください。
            </p>
          )}
        </section>

        <section className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-6 shadow-[10px_10px_0_#d8efee] sm:p-8">
          <h2 className="mb-6 text-2xl font-semibold">ログイン</h2>
          <LoginForm callbackUrl={redirectTo} />
        </section>
      </div>
    </main>
  );
}
