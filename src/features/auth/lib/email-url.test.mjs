import assert from "node:assert/strict";
import test from "node:test";

import { getEmailBaseUrl } from "./email-url.ts";

test("email links use the configured canonical URL", () => {
  assert.equal(
    getEmailBaseUrl({
      AUTH_URL: "https://connect.example/",
      NODE_ENV: "production",
    }),
    "https://connect.example",
  );
  assert.equal(
    getEmailBaseUrl({
      NODE_ENV: "production",
      VERCEL_URL: "connect.vercel.app",
    }),
    "https://connect.vercel.app",
  );
});

test("production email links never silently point at localhost", () => {
  assert.throws(() => getEmailBaseUrl({ NODE_ENV: "production" }), /AUTH_URL/);
  assert.equal(
    getEmailBaseUrl({ NODE_ENV: "development", PORT: "3100" }),
    "http://localhost:3100",
  );
});
