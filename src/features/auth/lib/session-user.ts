type FindUserById = (userId: string) => Promise<{ id: string } | null>;

export async function hasActiveSessionUser(
  userId: unknown,
  findUserById: FindUserById,
) {
  if (typeof userId !== "string" || userId.length === 0) {
    return false;
  }

  return Boolean(await findUserById(userId));
}
