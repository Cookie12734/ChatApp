const INTERNAL_ORIGIN = "https://connect.invalid";

export function getSafeInternalRedirect(
  value: FormDataEntryValue | null | undefined,
  fallback = "/",
) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return fallback;
  }

  try {
    const url = new URL(value, INTERNAL_ORIGIN);

    if (url.origin !== INTERNAL_ORIGIN) {
      return fallback;
    }

    if (url.pathname === "/auth" || url.pathname.startsWith("/auth/")) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
