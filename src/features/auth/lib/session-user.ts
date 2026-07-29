type SessionUser = {
  id: string;
  sessionVersion: number;
  userId: string;
};

type FindUserById = (userId: string) => Promise<SessionUser | null>;

export async function getActiveSessionUser(
  userId: unknown,
  sessionVersion: unknown,
  findUserById: FindUserById,
) {
  if (typeof userId !== "string" || userId.length === 0) {
    return null;
  }

  const user = await findUserById(userId);
  const expectedVersion =
    typeof sessionVersion === "number" ? sessionVersion : 0;

  return user?.sessionVersion === expectedVersion ? user : null;
}
