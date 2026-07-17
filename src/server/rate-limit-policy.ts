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

export function getRetryAfterSeconds(resetAt: Date, now = Date.now()) {
  return Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000));
}

export function getRateLimitMessage(error: RateLimitExceededError) {
  return `試行回数が多すぎます。${error.retryAfterSeconds}秒後にもう一度お試しください`;
}
