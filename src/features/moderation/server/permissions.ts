import "server-only";

import { env } from "~/env";
import { normalizeEmailAddress } from "~/features/auth/lib/email-normalization";
import { db } from "~/server/db";

export async function isModerator(userId: string) {
  const allowedEmails = new Set(
    (env.MODERATOR_EMAILS ?? "")
      .split(",")
      .map(normalizeEmailAddress)
      .filter(Boolean),
  );
  if (allowedEmails.size === 0) return false;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true },
  });

  return Boolean(
    user?.emailVerified &&
    user.email &&
    allowedEmails.has(normalizeEmailAddress(user.email)),
  );
}
