import {
  defaultShouldDehydrateQuery,
  MutationCache,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

function isUnauthorized(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "data" in error &&
    (error as { data?: { code?: string } }).data?.code === "UNAUTHORIZED"
  );
}

function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 3) return false;
  const code =
    error !== null && typeof error === "object" && "data" in error
      ? (error as { data?: { code?: string } }).data?.code
      : undefined;
  return ![
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "BAD_REQUEST",
    "UNPROCESSABLE_CONTENT",
    "TOO_MANY_REQUESTS",
  ].includes(code ?? "");
}

let isRedirectingToLogin = false;

function handleAuthError(error: unknown) {
  if (
    !isUnauthorized(error) ||
    typeof window === "undefined" ||
    isRedirectingToLogin
  ) {
    return;
  }

  isRedirectingToLogin = true;
  const callbackUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const loginUrl = new URL("/auth/login", window.location.origin);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  loginUrl.searchParams.set("reason", "session_expired");
  window.location.assign(loginUrl.toString());
}

export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: handleAuthError,
    }),
    mutationCache: new MutationCache({
      onError: handleAuthError,
    }),
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
        retry: shouldRetryQuery,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
