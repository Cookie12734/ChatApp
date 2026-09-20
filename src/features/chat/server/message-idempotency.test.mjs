import assert from "node:assert/strict";
import test from "node:test";

import {
  isSameAttachmentSet,
  isSameDirectMessage,
  isSameServerMessage,
} from "./message-idempotency.ts";

test("replays must preserve the attachment set including empty messages", () => {
  const attachments = [{ id: "a" }, { id: "b" }];
  assert.equal(isSameAttachmentSet(attachments, ["b", "a"]), true);
  assert.equal(isSameAttachmentSet([], []), true);
  for (const changed of [[], ["a"], ["a", "c"], ["a", "b", "c"], ["a", "a"]]) {
    assert.equal(isSameAttachmentSet(attachments, changed), false);
  }
  assert.equal(isSameAttachmentSet([], ["a"]), false);
});

test("a direct message client ID cannot be reused for another payload", () => {
  const message = { content: "hello", receiverId: "friend-a" };

  assert.equal(isSameDirectMessage(message, message), true);
  assert.equal(
    isSameDirectMessage(message, {
      content: "changed",
      receiverId: "friend-a",
    }),
    false,
  );
  assert.equal(
    isSameDirectMessage(message, {
      content: "hello",
      receiverId: "friend-b",
    }),
    false,
  );
});

test("a server message client ID cannot be reused across content or channels", () => {
  const message = {
    channelId: "channel-a",
    content: "hello",
    serverId: "server-a",
  };

  assert.equal(isSameServerMessage(message, message), true);
  assert.equal(
    isSameServerMessage(message, { ...message, channelId: "channel-b" }),
    false,
  );
  assert.equal(
    isSameServerMessage(message, { ...message, serverId: "server-b" }),
    false,
  );
  assert.equal(
    isSameServerMessage(message, { ...message, content: "changed" }),
    false,
  );
});
