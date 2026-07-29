import { createTransport } from "nodemailer";

import { env } from "~/env";

function getBaseUrl() {
  if (process.env.AUTH_URL) {
    return process.env.AUTH_URL.replace(/\/$/, "");
  }
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function buildVerificationUrl(token: string) {
  return `${getBaseUrl()}/auth/verify-email?token=${token}`;
}

async function sendEmail(input: {
  developmentLog: string;
  html: string;
  subject: string;
  text: string;
  to: string;
}) {
  if (!env.EMAIL_SERVER) {
    if (env.NODE_ENV === "production") {
      throw new Error("EMAIL_SERVER is not configured");
    }

    console.log(input.developmentLog);
    return;
  }

  if (!env.EMAIL_FROM) {
    throw new Error("EMAIL_FROM is not configured");
  }

  const transport = createTransport(env.EMAIL_SERVER);
  await transport.verify();

  const result = await transport.sendMail({
    to: input.to,
    from: env.EMAIL_FROM,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  const failed = result.rejected.concat(result.pending).filter(Boolean);
  if (failed.length || result.accepted.length === 0) {
    throw new Error(
      `メールの送信に失敗しました: ${failed.map(String).join(", ") || "accepted recipient is empty"}`,
    );
  }
}

export async function sendSignupVerificationEmail(to: string, token: string) {
  const url = buildVerificationUrl(token);

  await sendEmail({
    to,
    developmentLog: `\n[connect] メール確認リンク (${to}):\n${url}\n`,
    subject: "connect - メールアドレスの確認",
    text: `connectへようこそ。\n\n以下のリンクを開き、登録時のパスワードを入力してメールアドレスを確認してください。\n\n${url}\n\nこのリンクは24時間有効です。`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #18221f;">
        <h2>connectへようこそ</h2>
        <p>以下のボタンを押し、登録時のパスワードを入力してメールアドレスを確認してください。</p>
        <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #18221f; color: #f6f0e4; text-decoration: none; border-radius: 6px;">
          メールアドレスを確認する
        </a>
        <p style="color: #68716b; font-size: 14px; margin-top: 24px;">
          このリンクは24時間有効です。心当たりがない場合は無視してください。
        </p>
      </div>
    `,
  });
}

export function buildPasswordResetUrl(token: string) {
  return `${getBaseUrl()}/auth/reset-password?token=${token}`;
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const url = buildPasswordResetUrl(token);

  await sendEmail({
    to,
    developmentLog: `\n[connect] パスワード再設定リンク (${to}):\n${url}\n`,
    subject: "connect - パスワードの再設定",
    text: `以下のリンクを開いてパスワードを再設定してください。\n\n${url}\n\nこのリンクは1時間有効です。心当たりがない場合は無視してください。`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #18221f;">
        <h2>パスワードを再設定する</h2>
        <p>以下のボタンを押して新しいパスワードを設定してください。</p>
        <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #18221f; color: #f6f0e4; text-decoration: none; border-radius: 6px;">
          パスワードを再設定する
        </a>
        <p style="color: #68716b; font-size: 14px; margin-top: 24px;">
          このリンクは1時間有効です。心当たりがない場合は無視してください。
        </p>
      </div>
    `,
  });
}
