import assert from "node:assert/strict";
import test from "node:test";

import { getSafeInternalRedirect } from "./redirect-path.ts";

test("internal login destinations preserve their path, query, and hash", () => {
  assert.equal(
    getSafeInternalRedirect("/servers/invite/abc?from=login#invite"),
    "/servers/invite/abc?from=login#invite",
  );
});

test("external and protocol-relative login destinations fall back safely", () => {
  assert.equal(getSafeInternalRedirect("https://example.com/steal"), "/");
  assert.equal(getSafeInternalRedirect("//example.com/steal"), "/");
  assert.equal(getSafeInternalRedirect("/\\example.com/steal"), "/");
  assert.equal(getSafeInternalRedirect(null), "/");
});

test("auth destinations fall back instead of creating login redirect loops", () => {
  assert.equal(getSafeInternalRedirect("/auth/login"), "/");
  assert.equal(
    getSafeInternalRedirect(
      "/auth/login?callbackUrl=%2Fauth%2Flogin%3FcallbackUrl%3D%252F",
    ),
    "/",
  );
  assert.equal(getSafeInternalRedirect("/auth/signup"), "/");
});
