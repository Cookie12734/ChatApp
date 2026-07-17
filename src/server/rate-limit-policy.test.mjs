import assert from "node:assert/strict";
import test from "node:test";

import {
  createRateLimitKey,
  getRateLimitMessage,
  getRetryAfterSeconds,
  RateLimitExceededError,
} from "./rate-limit-policy.ts";

test("rate limit keys are deterministic without storing their subject", () => {
  const key = createRateLimitKey("auth:login", "person@example.com");

  assert.equal(key, createRateLimitKey("auth:login", "person@example.com"));
  assert.notEqual(key, createRateLimitKey("auth:login", "other@example.com"));
  assert.equal(key.includes("person@example.com"), false);
});

test("retry timing rounds up and never drops below one second", () => {
  assert.equal(getRetryAfterSeconds(new Date(10_001), 10_000), 1);
  assert.equal(getRetryAfterSeconds(new Date(11_001), 10_000), 2);
  assert.equal(getRetryAfterSeconds(new Date(9_000), 10_000), 1);
});

test("rate limit errors expose a safe retry message", () => {
  const error = new RateLimitExceededError(42);

  assert.equal(error.retryAfterSeconds, 42);
  assert.equal(
    getRateLimitMessage(error),
    "試行回数が多すぎます。42秒後にもう一度お試しください",
  );
});
