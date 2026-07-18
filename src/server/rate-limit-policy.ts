import { createHash } from "node:crypto";

export type RateLimitRule = {
  limit: number;
  scope: string;
  subject: string;
  windowMs: number;
};

export class RateLimitExceededError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many requests");
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function createRateLimitKey(scope: string, subject: string) {
  const subjectHash = createHash("sha256").update(subject).digest("hex");
  return `${scope}:${subjectHash}`;
}

export function getRateLimitSubjectFromHeaders(
  forwardedFor: string | null,
  realAddress: string | null,
) {
  const forwardedAddress = forwardedFor
    ?.split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .at(-1);
  let normalizedRealAddress = realAddress?.trim();
  if (normalizedRealAddress?.length === 0) normalizedRealAddress = undefined;
  const address = forwardedAddress ?? normalizedRealAddress ?? "unknown";

  return address.slice(0, 128);
}

export function getRetryAfterSeconds(resetAt: Date, now = Date.now()) {
  return Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000));
}

export function getRateLimitMessage(error: RateLimitExceededError) {
  return `試行回数が多すぎます。${error.retryAfterSeconds}秒後にもう一度お試しください`;
}
