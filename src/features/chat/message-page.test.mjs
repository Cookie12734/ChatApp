import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeMessageCursor,
  flattenMessagePages,
  getMessageCursorWhere,
  prepareMessagePage,
} from "./message-page.ts";
import {
  createMessageEventQueue,
  updateMessagePages,
} from "./realtime-messages.ts";

const message = (id, timestamp) => ({ id, createdAt: new Date(timestamp) });

test("history pages are rendered oldest first without mutating the cache", () => {
  const pages = [
    prepareMessagePage([message("4", 4), message("3", 3)]),
    prepareMessagePage([message("2", 2), message("1", 1)]),
  ];
  assert.deepEqual(
    flattenMessagePages(pages).map(({ id }) => id),
    ["1", "2", "3", "4"],
  );
  assert.equal(pages[0].messages[0].id, "3");
});

test("realtime edits do not append unloaded history, and creates sort and deduplicate", () => {
  const pages = [{ messages: [message("recent", 20)], nextCursor: "boundary" }];
  assert.equal(updateMessagePages(pages, message("old", 1), "updated"), pages);
  const second = updateMessagePages(pages, message("second", 40), "created");
  const first = updateMessagePages(second, message("first", 30), "created");
  const duplicate = updateMessagePages(first, message("first", 30), "created");
  assert.deepEqual(
    duplicate[0].messages.map(({ id }) => id),
    ["recent", "first", "second"],
  );
  assert.equal(duplicate[0].nextCursor, "boundary");
  const history = { messages: [message("old", 1)] };
  const edited = updateMessagePages(
    [...pages, history],
    { ...message("old", 1), content: "edited" },
    "updated",
  );
  assert.equal(edited[0], pages[0]);
  assert.equal(edited[1].messages[0].content, "edited");
});

test("a delayed edit cannot resurrect a deleted message or block other messages", async () => {
  const enqueue = createMessageEventQueue();
  let release;
  const response = new Promise((resolve) => {
    release = resolve;
  });
  let pages = [{ messages: [message("a", 1)] }];
  const edit = enqueue("a", async () => {
    const updated = await response;
    pages = updateMessagePages(pages, updated, "updated");
  });
  const remove = enqueue("a", async () => {
    pages = pages.map((page) => ({
      ...page,
      messages: page.messages.filter(({ id }) => id !== "a"),
    }));
  });
  await enqueue("b", async () => {
    pages = updateMessagePages(pages, message("b", 2), "created");
  });
  release(message("a", 1));
  await Promise.all([edit, remove]);
  assert.deepEqual(
    pages[0].messages.map(({ id }) => id),
    ["b"],
  );
  await assert.rejects(
    enqueue("a", async () => {
      throw new Error("network failure");
    }),
  );
  let recovered = false;
  await enqueue("a", async () => {
    recovered = true;
  });
  assert.equal(recovered, true);
});

test("message pages use a stable boundary cursor", () => {
  const newest = new Date("2026-01-03T00:00:00.000Z");
  const middle = new Date("2026-01-02T00:00:00.000Z");
  const oldest = new Date("2026-01-01T00:00:00.000Z");
  const page = prepareMessagePage(
    [
      { createdAt: newest, id: "new" },
      { createdAt: middle, id: "middle" },
      { createdAt: oldest, id: "old" },
    ],
    2,
  );

  assert.deepEqual(
    page.messages.map(({ id }) => id),
    ["middle", "new"],
  );
  assert.deepEqual(decodeMessageCursor(page.nextCursor), {
    createdAt: middle,
    id: "middle",
  });
  assert.deepEqual(
    getMessageCursorWhere(decodeMessageCursor(page.nextCursor)),
    {
      OR: [
        { createdAt: { lt: middle } },
        { createdAt: middle, id: { lt: "middle" } },
      ],
    },
  );
  assert.deepEqual(prepareMessagePage([{ createdAt: newest, id: "only" }], 2), {
    messages: [{ createdAt: newest, id: "only" }],
    nextCursor: undefined,
  });
  assert.equal(decodeMessageCursor("v1::message"), undefined);
  assert.equal(decodeMessageCursor("v1:9007199254740991:message"), undefined);
});
