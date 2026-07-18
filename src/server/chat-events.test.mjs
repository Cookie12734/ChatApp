import assert from "node:assert/strict";
import test from "node:test";

import { canReceiveChatEvent, getChatEventRecord } from "./chat-events.ts";

test("chat event records target direct participants without server fanout", () => {
  assert.deepEqual(
    getChatEventRecord({ kind: "direct", userIds: ["me", "friend"] }),
    {
      audienceIds: ["me", "friend"],
      kind: "direct",
      payload: { kind: "direct", userIds: ["me", "friend"] },
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
