import assert from "node:assert/strict";
import test from "node:test";

import {
  isSearchResultBeforeCursor,
  sortSearchResults,
} from "./search.ts";

test("search results have a stable newest-first order", () => {
  const time = new Date("2026-08-12T10:00:00.000Z");
  assert.deepEqual(
    sortSearchResults([
      { createdAt: new Date(time.getTime() - 1), id: "c" },
      { createdAt: time, id: "a" },
      { createdAt: time, id: "b" },
    ]).map(({ id }) => id),
    ["b", "a", "c"],
  );
  assert.equal(
    isSearchResultBeforeCursor(
      { createdAt: time, id: "a" },
      { createdAt: time, id: "b" },
    ),
    true,
  );
});
