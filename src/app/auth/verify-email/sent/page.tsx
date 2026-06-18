import { MailCheck } from "lucide-react";
import Link from "next/link";

export default function VerifyEmailSentPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f0e4] px-5 py-8 text-[#18221f]">
      <section className="w-full max-w-md rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-8 text-center shadow-[10px_10px_0_#d8efee]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-[#e4f2dc] text-[#114744]">
          <MailCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold">
          確認メールを送信しました
        </h1>
        <p className="mt-4 leading-7 text-[#53615a]">
          入力したメールアドレスに確認リンクを送りました。リンクを開くと登録が完了します。
        </p>
        <p className="mt-4 text-sm leading-6 text-[#68716b]">
          開発環境では、ターミナルに確認リンクが表示されます。
        </p>
        <Link
          href="/auth/login"
          className="mt-6 inline-flex rounded-md bg-[#18221f] px-5 py-3 font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37]"
        >
          ログインページへ
        </Link>
      </section>
    </main>
  );
}
