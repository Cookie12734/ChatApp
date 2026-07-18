import assert from "node:assert/strict";
import test from "node:test";

import { getChatEventRecord } from "./chat-events.ts";

test("chat event records target direct participants and server members", () => {
  assert.deepEqual(
    getChatEventRecord({ kind: "direct", userIds: ["me", "friend"] }),
    {
      audienceIds: ["me", "friend"],
      kind: "direct",
      payload: { kind: "direct", userIds: ["me", "friend"] },
    },
  );
  assert.deepEqual(
    getChatEventRecord(
      {
        change: "created",
        channelId: "general",
        kind: "server",
        senderId: "owner",
        serverId: "server-a",
      },
      ["owner", "member"],
    ),
    {
      audienceIds: ["owner", "member"],
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
