import assert from "node:assert/strict";
import test from "node:test";

import { canReceiveChatEvent } from "./chat-events.ts";

test("chat events are visible only to participants", () => {
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
      { kind: "server", serverId: "server-a" },
      "me",
      serverIds,
    ),
    true,
  );
  assert.equal(
    canReceiveChatEvent(
      { kind: "server", serverId: "server-b" },
      "me",
      serverIds,
    ),
    false,
  );
});
