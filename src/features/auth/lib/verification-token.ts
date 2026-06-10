import crypto from "crypto";

import { sendSignupVerificationEmail } from "~/features/auth/lib/email";
import { db } from "~/server/db";

const TOKEN_EXPIRY_HOURS = 24;

export async function createAndSendVerificationToken(email: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await db.verificationToken.deleteMany({
    where: { identifier: email },
  });

  await db.verificationToken.create({
    data: { identifier: email, token, expires },
  });

  await sendSignupVerificationEmail(email, token);
}

export async function verifyEmailToken(token: string) {
  const verificationToken = await db.verificationToken.findUnique({
    where: { token },
  });

  if (!verificationToken) {
    return { success: false as const, reason: "invalid" as const };
  }

  if (verificationToken.expires < new Date()) {
    await db.verificationToken.delete({ where: { token } });
    return { success: false as const, reason: "expired" as const };
  }

  const user = await db.user.findUnique({
    where: { email: verificationToken.identifier },
  });

  if (!user) {
    return { success: false as const, reason: "invalid" as const };
  }

  await db.user.update({
    where: { email: verificationToken.identifier },
    data: { emailVerified: new Date() },
  });

  await db.verificationToken.delete({ where: { token } });

  return { success: true as const };
}
