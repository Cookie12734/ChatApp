import crypto from "crypto";

import {
  isPasswordResetIdentifier,
  isVerificationTokenExpired,
  matchesSupportedBcryptPassword,
} from "~/features/auth/lib/credential-policy";
import { normalizeEmailAddress } from "~/features/auth/lib/email-normalization";
import { buildVerificationUrl } from "~/features/auth/lib/email";
import { sendSignupVerificationEmail } from "~/features/auth/lib/email";
import { db } from "~/server/db";

const TOKEN_EXPIRY_HOURS = 24;

type PendingRegistrationInput = {
  email: string;
  name: string;
  passwordHash: string;
  userId: string;
};

function isUniqueConstraintError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function createAndSendPendingRegistration({
  email,
  name,
  passwordHash,
  userId,
}: PendingRegistrationInput) {
  const normalizedEmail = normalizeEmailAddress(email);
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await db.$transaction([
    db.pendingRegistration.deleteMany({
      where: { expires: { lte: now } },
    }),
    db.verificationToken.deleteMany({
      where: {
        OR: [{ identifier: normalizedEmail }, { expires: { lte: now } }],
      },
    }),
    db.pendingRegistration.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        expires,
        name,
        passwordHash,
        token,
        userId,
      },
      update: { expires, name, passwordHash, token, userId },
    }),
  ]);

  await sendSignupVerificationEmail(normalizedEmail, token);
}

export async function createAndSendVerificationToken(email: string) {
  const normalizedEmail = normalizeEmailAddress(email);
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  const [, pendingRegistration] = await db.$transaction([
    db.verificationToken.deleteMany({
      where: {
        OR: [{ identifier: normalizedEmail }, { expires: { lte: now } }],
      },
    }),
    db.pendingRegistration.updateMany({
      where: { email: normalizedEmail },
      data: { expires, token },
    }),
  ]);

  if (pendingRegistration.count !== 1) {
    throw new Error("Pending registration was not found");
  }

  await sendSignupVerificationEmail(normalizedEmail, token);
}

export async function getDevelopmentVerificationUrl(email: string) {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const pendingRegistration = await db.pendingRegistration.findUnique({
    where: { email: normalizeEmailAddress(email) },
    select: { token: true },
  });

  return pendingRegistration
    ? buildVerificationUrl(pendingRegistration.token)
    : null;
}

export async function getVerificationTokenStatus(token: string) {
  const pendingRegistration = await db.pendingRegistration.findUnique({
    where: { token },
    select: { expires: true },
  });

  if (pendingRegistration) {
    return isVerificationTokenExpired(pendingRegistration.expires)
      ? ("expired" as const)
      : ("valid" as const);
  }

  const legacyToken = await db.verificationToken.findUnique({
    where: { token },
    select: { identifier: true },
  });

  if (legacyToken) {
    if (isPasswordResetIdentifier(legacyToken.identifier)) {
      return "invalid" as const;
    }

    await db.verificationToken.deleteMany({
      where: { identifier: legacyToken.identifier },
    });
    return "legacy" as const;
  }

  return "invalid" as const;
}

export async function verifyEmailToken(token: string, password: string) {
  const pendingRegistration = await db.pendingRegistration.findUnique({
    where: { token },
  });

  if (!pendingRegistration) {
    const legacyToken = await db.verificationToken.findUnique({
      where: { token },
      select: { identifier: true },
    });

    if (legacyToken) {
      if (isPasswordResetIdentifier(legacyToken.identifier)) {
        return { success: false as const, reason: "invalid" as const };
      }

      await db.verificationToken.deleteMany({
        where: { identifier: legacyToken.identifier },
      });
      return { success: false as const, reason: "legacy" as const };
    }

    return { success: false as const, reason: "invalid" as const };
  }

  const now = new Date();

  if (isVerificationTokenExpired(pendingRegistration.expires, now)) {
    return { success: false as const, reason: "expired" as const };
  }

  if (
    !(await matchesSupportedBcryptPassword(
      password,
      pendingRegistration.passwordHash,
    ))
  ) {
    return { success: false as const, reason: "invalid" as const };
  }

  try {
    const user = await db.$transaction(async (transaction) => {
      const claimed = await transaction.pendingRegistration.deleteMany({
        where: { expires: { gt: now }, token },
      });

      if (claimed.count !== 1) {
        return null;
      }

      await transaction.verificationToken.deleteMany({
        where: { identifier: pendingRegistration.email },
      });

      return transaction.user.create({
        data: {
          email: pendingRegistration.email,
          emailVerified: now,
          name: pendingRegistration.name,
          passwordHash: pendingRegistration.passwordHash,
          userId: pendingRegistration.userId,
        },
      });
    });

    if (!user) {
      return { success: false as const, reason: "invalid" as const };
    }
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    await db.pendingRegistration.deleteMany({ where: { token } });
    return { success: false as const, reason: "conflict" as const };
  }

  return { success: true as const };
}
