import assert from "node:assert/strict";
import test from "node:test";

import {
  canOpenChatEventConnection,
  canReceiveChatEvent,
  getChatEventRecord,
  takePendingLocalEventIds,
} from "./chat-events.ts";

test("chat event records target direct participants without server fanout", () => {
  assert.deepEqual(
    getChatEventRecord({ kind: "direct", userIds: ["me", "friend"] }),
    {
      audienceIds: ["me", "friend"],
      kind: "direct",
      payload: { kind: "direct", userIds: ["me", "friend"] },
      serverId: null,
    },
  );
  assert.deepEqual(
    getChatEventRecord({
      change: "created",
      channelId: "general",
      kind: "server",
      senderId: "owner",
      serverId: "server-a",
    }),
    {
      audienceIds: [],
      kind: "server",
      payload: {
        change: "created",
        channelId: "general",
        kind: "server",
        senderId: "owner",
        serverId: "server-a",
      },
      serverId: "server-a",
    },
  );
});

test("chat event recipients are filtered by participant or server membership", () => {
  const serverIds = new Set(["server-a"]);

  assert.equal(
    canReceiveChatEvent(
      { kind: "direct", userIds: ["me", "friend"] },
      "me",
      serverIds,
    ),
    true,
  );
  assert.equal(
    canReceiveChatEvent(
      { kind: "direct", userIds: ["other", "friend"] },
      "me",
      serverIds,
    ),
    false,
  );
  assert.equal(
    canReceiveChatEvent(
      {
        change: "created",
        channelId: "general",
        kind: "server",
        senderId: "friend",
        serverId: "server-a",
      },
      "me",
      serverIds,
    ),
    true,
  );
});

test("chat event connections stop at the configured per-user limit", () => {
  assert.equal(canOpenChatEventConnection(2, 3), true);
  assert.equal(canOpenChatEventConnection(3, 3), false);
});

test("local chat event IDs are drained even when no subscriber targets them", () => {
  const localEventIds = new Set(["1", "3", "4", "5"]);

  assert.deepEqual(takePendingLocalEventIds(localEventIds, 2n, 2), [3n, 4n]);
  assert.deepEqual([...localEventIds], ["3", "4", "5"]);
  assert.deepEqual(takePendingLocalEventIds(localEventIds, 4n), [5n]);
  assert.deepEqual([...localEventIds], ["5"]);
});
