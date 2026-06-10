import { redirect } from "next/navigation";

import { SignUpForm } from "~/features/auth/components/sign-up-form";
import { auth } from "~/features/auth";

export default async function SignUpPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white">
      <div className="flex flex-col items-center gap-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">新規登録</h1>
          <p className="mt-2 text-zinc-400">
            アカウント作成後、確認メールが届きます
          </p>
        </div>
        <SignUpForm />
      </div>
    </main>
  );
}
