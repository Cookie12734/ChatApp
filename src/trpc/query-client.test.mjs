import assert from "node:assert/strict";
import test from "node:test";

import { createQueryClient } from "./query-client.ts";

test("permanent query errors and rate limits are not retried", async () => {
  for (const code of [
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "BAD_REQUEST",
    "UNPROCESSABLE_CONTENT",
    "TOO_MANY_REQUESTS",
  ]) {
    const client = createQueryClient();
    let attempts = 0;
    const error = Object.assign(new Error(code), { data: { code } });
    try {
      await assert.rejects(
        client.fetchQuery({
          queryKey: [code],
          retryDelay: 0,
          queryFn: () => {
            attempts += 1;
            throw error;
          },
        }),
        (actual) => actual === error,
      );
      assert.equal(attempts, 1, code);
    } finally {
      client.clear();
    }
  }
});

test("temporary query failures retain the three-retry limit", async () => {
  for (const error of [
    new TypeError("Failed to fetch"),
    Object.assign(new Error("Server failed"), {
      data: { code: "INTERNAL_SERVER_ERROR" },
    }),
  ]) {
    const client = createQueryClient();
    let attempts = 0;
    try {
      await assert.rejects(
        client.fetchQuery({
          queryKey: [error.message],
          retryDelay: 0,
          queryFn: () => {
            attempts += 1;
            throw error;
          },
        }),
      );
      assert.equal(attempts, 4);
    } finally {
      client.clear();
    }
  }
});
