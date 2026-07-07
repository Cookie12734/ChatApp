import "server-only";

import { normalizeEmailAddress } from "~/features/auth/lib/email-normalization";
import { db } from "~/server/db";

export async function findUserByNormalizedEmail(email: string) {
  const normalizedEmail = normalizeEmailAddress(email);
  const users = await db.user.findMany({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive",
      },
    },
    orderBy: { id: "asc" },
    take: 2,
  });

  return {
    isAmbiguous: users.length > 1,
    normalizedEmail,
    user: users.length === 1 ? users[0] : null,
  };
}
