import assert from "node:assert/strict";
import test from "node:test";

import { getGroupInviteIssue, isSameGroupMessage } from "./group-policy.ts";

test("group invites accept friends when the resulting group is within the limit", () => {
  assert.equal(
    getGroupInviteIssue({
      blockEdges: [],
      candidateIds: ["friend-a", "friend-b"],
      existingMemberIds: ["owner"],
      friendIds: ["friend-a", "friend-b"],
    }),
    undefined,
  );
});

test("group invites reject duplicates, existing members, non-friends, and overflow", () => {
  const base = {
    blockEdges: [],
    existingMemberIds: ["owner"],
    friendIds: ["friend-a", "friend-b"],
  };

  assert.equal(
    getGroupInviteIssue({
      ...base,
      candidateIds: ["friend-a", "friend-a"],
    }),
    "DUPLICATE",
  );
  assert.equal(
    getGroupInviteIssue({ ...base, candidateIds: ["owner"] }),
    "ALREADY_MEMBER",
  );
  assert.equal(
    getGroupInviteIssue({ ...base, candidateIds: ["stranger"] }),
    "NOT_FRIEND",
  );
  assert.equal(
    getGroupInviteIssue({
      blockEdges: [],
      candidateIds: ["friend-a", "friend-b"],
      existingMemberIds: Array.from(
        { length: 9 },
        (_, index) => `member-${index}`,
      ),
      friendIds: ["friend-a", "friend-b"],
    }),
    "TOO_MANY",
  );
});

test("group invites reject a block in either direction between resulting members", () => {
  assert.equal(
    getGroupInviteIssue({
      blockEdges: [{ blockerId: "member", blockedId: "friend" }],
      candidateIds: ["friend"],
      existingMemberIds: ["owner", "member"],
      friendIds: ["friend"],
    }),
    "BLOCKED",
  );
});

test("message idempotency includes group, content, and reply target", () => {
  const message = {
    content: "hello",
    groupId: "group-a",
    replyToId: "message-a",
  };

  assert.equal(isSameGroupMessage(message, message), true);
  assert.equal(
    isSameGroupMessage(message, { ...message, groupId: "group-b" }),
    false,
  );
  assert.equal(
    isSameGroupMessage(message, { ...message, replyToId: null }),
    false,
  );
});
