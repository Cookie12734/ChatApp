import "server-only";

import { cookies } from "next/headers";

const PENDING_VERIFICATION_EMAIL_COOKIE = "pending-verification-email";
const VERIFICATION_EMAIL_SENT_AT_COOKIE = "verification-email-sent-at";
const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

export const VERIFICATION_EMAIL_RESEND_COOLDOWN_SECONDS = 30;

function getCookieOptions() {
  return {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/auth",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function rememberVerificationEmailSent(email: string) {
  const cookieStore = await cookies();
  const options = getCookieOptions();

  cookieStore.set(PENDING_VERIFICATION_EMAIL_COOKIE, email, options);
  cookieStore.set(
    VERIFICATION_EMAIL_SENT_AT_COOKIE,
    String(Date.now()),
    options,
  );
}

export async function clearPendingVerificationEmail() {
  const cookieStore = await cookies();
  const options = { ...getCookieOptions(), maxAge: 0 };

  cookieStore.set(PENDING_VERIFICATION_EMAIL_COOKIE, "", options);
  cookieStore.set(VERIFICATION_EMAIL_SENT_AT_COOKIE, "", options);
}

export async function getPendingVerificationEmailSession() {
  const cookieStore = await cookies();
  const email = cookieStore.get(PENDING_VERIFICATION_EMAIL_COOKIE)?.value;
  const sentAtValue = cookieStore.get(VERIFICATION_EMAIL_SENT_AT_COOKIE)?.value;
  const sentAt = sentAtValue ? Number(sentAtValue) : Number.NaN;
  const elapsedSeconds = Number.isFinite(sentAt)
    ? Math.floor((Date.now() - sentAt) / 1000)
    : VERIFICATION_EMAIL_RESEND_COOLDOWN_SECONDS;
  const remainingSeconds = Math.max(
    VERIFICATION_EMAIL_RESEND_COOLDOWN_SECONDS - elapsedSeconds,
    0,
  );

  return {
    canResend: Boolean(email) && remainingSeconds === 0,
    email,
    remainingSeconds,
  };
}
