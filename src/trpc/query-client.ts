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
  window.location.assign("/auth/login");
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
        retry: (failureCount, error) =>
          !isUnauthorized(error) && failureCount < 3,
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
