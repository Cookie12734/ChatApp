import { TRPCError } from "@trpc/server";

import {
  getRateLimitMessage,
  RateLimitExceededError,
  type RateLimitRule,
} from "~/server/rate-limit-policy";
import { enforceRateLimits } from "~/server/rate-limit";

export async function enforceTRPCRateLimits(rules: RateLimitRule[]) {
  try {
    await enforceRateLimits(rules);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: getRateLimitMessage(error),
        cause: error,
      });
    }

    throw error;
  }
}
