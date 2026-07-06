export function getOAuthUserIdCandidate(seed: string | null | undefined) {
  const normalized = (seed ?? "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase()
    .slice(0, 32);

  return normalized.length >= 3 ? normalized : "user";
}

export function withOAuthUserIdSuffix(candidate: string, suffix: string) {
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const tail = `_${safeSuffix.slice(0, 6)}`;

  return `${candidate.slice(0, 32 - tail.length)}${tail}`;
}
