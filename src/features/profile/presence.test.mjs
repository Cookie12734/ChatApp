import assert from "node:assert/strict";
import test from "node:test";

import {
  getEffectivePresenceStatus,
  getPresenceDisplayLabel,
  getPresenceDotClassName,
} from "./presence.ts";

test("unknown presence falls back to invisible display", () => {
  assert.equal(
    getPresenceDisplayLabel(undefined),
    getPresenceDisplayLabel("INVISIBLE"),
  );
  assert.equal(
    getPresenceDotClassName(undefined),
    getPresenceDotClassName("INVISIBLE"),
  );
});

test("presence becomes invisible after the connection heartbeat expires", () => {
  const now = Date.parse("2026-07-18T12:00:00.000Z");

  assert.equal(
    getEffectivePresenceStatus("DND", new Date(now - 40_000), now),
    "DND",
  );
  assert.equal(
    getEffectivePresenceStatus("ONLINE", new Date(now - 46_000), now),
    "INVISIBLE",
  );
  assert.equal(
    getEffectivePresenceStatus("INVISIBLE", new Date(now), now),
    "INVISIBLE",
  );
});
