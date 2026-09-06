import assert from "node:assert/strict";
import test from "node:test";
import { getMessageSendAttempt } from "./message-send-attempt.ts";

test("a failed send reuses its ID only for the same conversation and payload", () => {
  const input = {
    conversationId: "user-a:group-a",
    content: "hello",
    replyToId: "reply-a",
    attachmentIds: ["b", "a"],
  };
  const attempt = getMessageSendAttempt(undefined, input);
  assert.equal(getMessageSendAttempt(attempt, input), attempt);
  assert.equal(
    getMessageSendAttempt(attempt, { ...input, attachmentIds: ["a", "b"] }),
    attempt,
  );
  assert.deepEqual(input.attachmentIds, ["b", "a"]);
  for (const changed of [
    { conversationId: "user-b:group-a" },
    { conversationId: "user-a:group-b" },
    { content: "edited" },
    { replyToId: undefined },
    { replyToId: "reply-b" },
    { attachmentIds: ["a"] },
    { attachmentIds: ["a", "c"] },
  ]) {
    assert.notEqual(
      getMessageSendAttempt(attempt, { ...input, ...changed }).clientId,
      attempt.clientId,
    );
  }
  // A successful send clears the attempt, allowing an intentional repeat.
  assert.notEqual(
    getMessageSendAttempt(undefined, input).clientId,
    attempt.clientId,
  );
  input.attachmentIds.push("c");
  assert.notEqual(
    getMessageSendAttempt(attempt, input).clientId,
    attempt.clientId,
  );
});
