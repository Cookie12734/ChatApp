import { PenLine } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { SignUpForm } from "~/features/auth/components/sign-up-form";

export default async function SignUpPage() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/");
  }

  return (
    <main className="bg-connect-paper text-connect-ink min-h-screen px-5 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="max-w-lg">
          <div className="bg-connect-ink text-connect-paper mb-6 flex h-12 w-12 items-center justify-center rounded-md">
            <PenLine className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-connect-danger mb-4 text-sm font-semibold uppercase">
            connect
          </p>
          <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">
            会話の置き場所を、
            <br />
            ひとつ作る。
          </h1>
          <p className="text-connect-muted mt-5 leading-8">
            登録後、確認メールのリンクからアカウントを有効化できます。
            ユーザーIDはフレンド申請に使います。
          </p>
        </section>

        <section className="border-connect-ink/15 bg-connect-surface rounded-md border p-6 shadow-[10px_10px_0_var(--color-focus-on-dark)] sm:p-8">
          <h2 className="mb-6 text-2xl font-semibold">新規登録</h2>
          <SignUpForm />
        </section>
      </div>
    </main>
  );
}
