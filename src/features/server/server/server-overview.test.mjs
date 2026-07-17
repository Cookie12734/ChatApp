import assert from "node:assert/strict";
import test from "node:test";

import { addUnreadCountsToServerChannels } from "./server-overview.ts";

test("addUnreadCountsToServerChannels merges legacy null messages into general", () => {
  const channels = [
    { id: "general-a", name: "general", serverId: "server-a" },
    { id: "chat-a", name: "chat", serverId: "server-a" },
    { id: "general-b", name: "general", serverId: "server-b" },
  ];
  const groups = [
    {
      serverId: "server-a",
      channelId: "general-a",
      _count: { _all: 2 },
    },
    { serverId: "server-a", channelId: null, _count: { _all: 3 } },
    { serverId: "server-a", channelId: "chat-a", _count: { _all: 4 } },
    { serverId: "server-b", channelId: null, _count: { _all: 5 } },
  ];

  assert.deepEqual(
    addUnreadCountsToServerChannels(channels, groups).map(
      ({ id, unreadCount }) => ({ id, unreadCount }),
    ),
    [
      { id: "general-a", unreadCount: 5 },
      { id: "chat-a", unreadCount: 4 },
      { id: "general-b", unreadCount: 5 },
    ],
  );
});

test("addUnreadCountsToServerChannels defaults channels without messages to zero", () => {
  assert.deepEqual(
    addUnreadCountsToServerChannels(
      [{ id: "quiet", name: "quiet", serverId: "server" }],
      [],
    ),
    [{ id: "quiet", name: "quiet", serverId: "server", unreadCount: 0 }],
  );
});
