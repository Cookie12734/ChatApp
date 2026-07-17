import crypto from "crypto";

import { normalizeEmailAddress } from "~/features/auth/lib/email-normalization";
import { buildVerificationUrl } from "~/features/auth/lib/email";
import { sendSignupVerificationEmail } from "~/features/auth/lib/email";
import { findUserByNormalizedEmail } from "~/features/auth/lib/email-user";
import { db } from "~/server/db";

const TOKEN_EXPIRY_HOURS = 24;

export async function createAndSendVerificationToken(email: string) {
  const normalizedEmail = normalizeEmailAddress(email);
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await db.verificationToken.deleteMany({
    where: { identifier: normalizedEmail },
  });

  await db.verificationToken.create({
    data: { identifier: normalizedEmail, token, expires },
  });

  await sendSignupVerificationEmail(normalizedEmail, token);
}

export async function getDevelopmentVerificationUrl(email: string) {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const verificationToken = await db.verificationToken.findFirst({
    where: { identifier: normalizeEmailAddress(email) },
    orderBy: { expires: "desc" },
    select: { token: true },
  });

  return verificationToken
    ? buildVerificationUrl(verificationToken.token)
    : null;
}

export async function getVerificationTokenStatus(token: string) {
  const verificationToken = await db.verificationToken.findUnique({
    where: { token },
    select: { expires: true },
  });

  if (!verificationToken) {
    return "invalid" as const;
  }

  return verificationToken.expires < new Date()
    ? ("expired" as const)
    : ("valid" as const);
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

  const { isAmbiguous, normalizedEmail, user } =
    await findUserByNormalizedEmail(verificationToken.identifier);

  if (isAmbiguous || !user) {
    return { success: false as const, reason: "invalid" as const };
  }

  await db.user.update({
    where: { id: user.id },
    data: { email: normalizedEmail, emailVerified: new Date() },
  });

  await db.verificationToken.delete({ where: { token } });

  return { success: true as const };
}
