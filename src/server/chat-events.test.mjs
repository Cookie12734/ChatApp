import assert from "node:assert/strict";
import test from "node:test";

import {
  canOpenChatEventConnection,
  canReceiveChatEvent,
  getChatEventRecord,
  shouldReplayLocalChatEvent,
  takePendingLocalEventIds,
} from "./chat-events.ts";

test("chat event records target direct participants without server fanout", () => {
  assert.deepEqual(
    getChatEventRecord({
      change: "created",
      kind: "direct",
      messageId: "message-a",
      userIds: ["me", "friend"],
    }),
    {
      audienceIds: ["me", "friend"],
      kind: "direct",
      payload: {
        change: "created",
        kind: "direct",
        messageId: "message-a",
        userIds: ["me", "friend"],
      },
      serverId: null,
    },
  );
  assert.deepEqual(
    getChatEventRecord({
      change: "created",
      channelId: "general",
      kind: "server",
      messageId: "message-b",
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
        messageId: "message-b",
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
      {
        change: "created",
        kind: "direct",
        messageId: "message-a",
        userIds: ["me", "friend"],
      },
      "me",
      serverIds,
    ),
    true,
  );
  assert.equal(
    canReceiveChatEvent(
      {
        change: "created",
        kind: "direct",
        messageId: "message-a",
        userIds: ["other", "friend"],
      },
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
        messageId: "message-b",
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
  const localEventVersions = new Map(["1", "3", "4", "5"].map((id) => [id, 1]));

  assert.deepEqual(takePendingLocalEventIds(localEventVersions, 2n, 2), [
    3n,
    4n,
  ]);
  assert.deepEqual([...localEventVersions.keys()], ["3", "4", "5"]);
  assert.deepEqual(takePendingLocalEventIds(localEventVersions, 4n), [5n]);
  assert.deepEqual([...localEventVersions.keys()], ["5"]);
});

test("a local event is replayed when the subscriber set changed", () => {
  assert.equal(shouldReplayLocalChatEvent(3, 3), false);
  assert.equal(shouldReplayLocalChatEvent(3, 4), true);
  assert.equal(shouldReplayLocalChatEvent(undefined, 4), true);
});
