import { headers } from "next/headers";

import { Prisma } from "../../generated/prisma";
import {
  createRateLimitKey,
  getRetryAfterSeconds,
  RateLimitExceededError,
  type RateLimitRule,
} from "~/server/rate-limit-policy";
import { db } from "~/server/db";

type RateLimitBucketRow = {
  count: number;
  resetAt: Date;
};

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const EXPIRED_BUCKET_RETENTION_MS = 24 * 60 * 60 * 1000;
let nextCleanupAt = 0;

async function cleanupExpiredBuckets(now: number) {
  if (now < nextCleanupAt) return;

  nextCleanupAt = now + CLEANUP_INTERVAL_MS;
  const cutoff = new Date(now - EXPIRED_BUCKET_RETENTION_MS);

  try {
    await db.$executeRaw(
      Prisma.sql`DELETE FROM "RateLimitBucket" WHERE "resetAt" < ${cutoff}`,
    );
  } catch {
    nextCleanupAt = 0;
  }
}

async function enforceRateLimit(rule: RateLimitRule) {
  const now = Date.now();
  const resetAt = new Date(now + rule.windowMs);
  const key = createRateLimitKey(rule.scope, rule.subject);
  const rows = await db.$queryRaw<RateLimitBucketRow[]>(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${resetAt}, CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= CURRENT_TIMESTAMP THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= CURRENT_TIMESTAMP THEN EXCLUDED."resetAt"
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "count", "resetAt"
  `);
  const bucket = rows[0];

  if (!bucket) {
    throw new Error("Rate limit bucket was not returned");
  }

  await cleanupExpiredBuckets(now);

  if (bucket.count > rule.limit) {
    throw new RateLimitExceededError(getRetryAfterSeconds(bucket.resetAt, now));
  }
}

export async function enforceRateLimits(rules: RateLimitRule[]) {
  await Promise.all(rules.map((rule) => enforceRateLimit(rule)));
}

export async function getRequestRateLimitSubject() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const realAddress = requestHeaders.get("x-real-ip")?.trim();
  const address =
    [forwardedFor, realAddress].find(
      (candidate) => candidate !== undefined && candidate.length > 0,
    ) ?? "unknown";

  return address.slice(0, 128);
}
