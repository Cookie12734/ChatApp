import { redirect } from "next/navigation";

import { LoginForm } from "~/features/auth/components/login-form";
import { auth } from "~/features/auth";

type LoginPageProps = {
  searchParams: Promise<{ verified?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  const { verified } = await searchParams;

  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white">
      <div className="flex flex-col items-center gap-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">ログイン</h1>
          <p className="mt-2 text-zinc-400">
            メールアドレスとパスワードでログイン
          </p>
          {verified === "1" && (
            <p className="mt-4 rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">
              メールアドレスの確認が完了しました。ログインしてください。
            </p>
          )}
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
