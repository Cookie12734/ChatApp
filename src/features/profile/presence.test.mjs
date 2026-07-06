import assert from "node:assert/strict";
import test from "node:test";

import {
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
