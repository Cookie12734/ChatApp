export function matchesFriendSearch(
  user: { name?: string | null; userId: string },
  query: string,
) {
  const needle = query.trim().toLowerCase();

  return (
    needle.length === 0 ||
    user.userId.toLowerCase().includes(needle) ||
    Boolean(user.name?.toLowerCase().includes(needle))
  );
}
