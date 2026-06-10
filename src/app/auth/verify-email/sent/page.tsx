import Link from "next/link";

export default function VerifyEmailSentPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white">
      <div className="flex max-w-md flex-col items-center gap-6 px-4 text-center">
        <h1 className="text-3xl font-bold">確認メールを送信しました</h1>
        <p className="text-zinc-400">
          入力したメールアドレスに確認リンクを送信しました。メール内のリンクをクリックして、アカウントの登録を完了してください。
        </p>
        <p className="text-sm text-zinc-500">
          開発環境では、ターミナルに確認リンクが表示されます。
        </p>
        <Link
          href="/auth/login"
          className="rounded-lg bg-zinc-800 px-6 py-2 font-medium transition hover:bg-zinc-700"
        >
          ログインページへ
        </Link>
      </div>
    </main>
  );
}
