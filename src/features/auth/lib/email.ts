import { createTransport } from "nodemailer";

import { env } from "~/env";

function getBaseUrl() {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function buildVerificationUrl(token: string) {
  return `${getBaseUrl()}/auth/verify-email?token=${token}`;
}

export async function sendSignupVerificationEmail(to: string, token: string) {
  const url = buildVerificationUrl(token);

  if (!env.EMAIL_SERVER) {
    console.log(`\n[ChatApp] メール確認リンク (${to}):\n${url}\n`);
    return;
  }

  const transport = createTransport(env.EMAIL_SERVER);
  const result = await transport.sendMail({
    to,
    from: env.EMAIL_FROM ?? "noreply@localhost",
    subject: "ChatApp - メールアドレスの確認",
    text: `ChatApp へようこそ。\n\n以下のリンクをクリックしてメールアドレスを確認してください:\n\n${url}\n\nこのリンクは24時間有効です。`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>ChatApp へようこそ</h2>
        <p>以下のボタンをクリックしてメールアドレスを確認してください。</p>
        <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #18181b; color: #fff; text-decoration: none; border-radius: 8px;">
          メールアドレスを確認する
        </a>
        <p style="color: #71717a; font-size: 14px; margin-top: 24px;">
          このリンクは24時間有効です。心当たりがない場合は無視してください。
        </p>
      </div>
    `,
  });

  const failed = result.rejected.concat(result.pending).filter(Boolean);
  if (failed.length) {
    throw new Error(
      `メールの送信に失敗しました: ${failed.map(String).join(", ")}`,
    );
  }
}
