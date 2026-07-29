import crypto from "crypto";

import {
  getPasswordResetIdentifier,
  isPasswordResetIdentifier,
  PASSWORD_RESET_IDENTIFIER_PREFIX,
} from "~/features/auth/lib/credential-policy";
import { normalizeEmailAddress } from "~/features/auth/lib/email-normalization";
import { findUserByNormalizedEmail } from "~/features/auth/lib/email-user";
import { sendPasswordResetEmail } from "~/features/auth/lib/email";
import { db } from "~/server/db";

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

export async function createAndSendPasswordResetToken(email: string) {
  const normalizedEmail = normalizeEmailAddress(email);
  const identifier = getPasswordResetIdentifier(normalizedEmail);
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + PASSWORD_RESET_EXPIRY_MS);

  await db.$transaction([
    db.verificationToken.deleteMany({
      where: { OR: [{ expires: { lte: now } }, { identifier }] },
    }),
    db.verificationToken.create({
      data: { expires, identifier, token },
    }),
  ]);

  await sendPasswordResetEmail(normalizedEmail, token);
}

export async function getPasswordResetTokenStatus(token: string) {
  const resetToken = await db.verificationToken.findUnique({
    where: { token },
  });

  if (!resetToken || !isPasswordResetIdentifier(resetToken.identifier)) {
    return "invalid" as const;
  }

  if (resetToken.expires <= new Date()) {
    await db.verificationToken.deleteMany({ where: { token } });
    return "expired" as const;
  }

  return "valid" as const;
}

export async function consumePasswordResetToken(
  token: string,
  passwordHash: string,
) {
  const resetToken = await db.verificationToken.findUnique({
    where: { token },
  });

  if (!resetToken || !isPasswordResetIdentifier(resetToken.identifier)) {
    return { success: false as const, reason: "invalid" as const };
  }

  const now = new Date();

  if (resetToken.expires <= now) {
    await db.verificationToken.deleteMany({ where: { token } });
    return { success: false as const, reason: "expired" as const };
  }

  const email = resetToken.identifier.slice(
    PASSWORD_RESET_IDENTIFIER_PREFIX.length,
  );
  const { isAmbiguous, user } = await findUserByNormalizedEmail(email);

  if (isAmbiguous || !user?.emailVerified || !user.passwordHash) {
    await db.verificationToken.deleteMany({
      where: { identifier: resetToken.identifier },
    });
    return { success: false as const, reason: "invalid" as const };
  }

  const changed = await db.$transaction(async (transaction) => {
    const claimed = await transaction.verificationToken.deleteMany({
      where: {
        expires: { gt: now },
        identifier: resetToken.identifier,
        token,
      },
    });

    if (claimed.count !== 1) {
      return false;
    }

    await transaction.verificationToken.deleteMany({
      where: { identifier: resetToken.identifier },
    });
    const updated = await transaction.user.updateMany({
      where: { emailVerified: { not: null }, id: user.id },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });

    if (updated.count !== 1) {
      return false;
    }

    await transaction.session.deleteMany({ where: { userId: user.id } });
    return true;
  });

  return changed
    ? ({ success: true as const } as const)
    : ({ success: false as const, reason: "invalid" as const } as const);
}
