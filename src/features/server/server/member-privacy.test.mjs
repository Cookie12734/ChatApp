import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

import * as blocking from "../../friend/server/blocking.ts";
import * as presence from "../../profile/presence.ts";
import * as messageIdempotency from "../../chat/server/message-idempotency.ts";
import * as messagePage from "../../chat/message-page.ts";
import * as messagePermissions from "./message-permissions.ts";
import * as serverOverview from "./server-overview.ts";
import * as input from "../../../lib/input.ts";
import * as staticImage from "../../../lib/static-image.ts";

const require = createRequire(import.meta.url);

function loadModule(relativePath, dependencies) {
  const { outputText } = ts.transpileModule(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  );
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    if (name.startsWith("~/")) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    }
    return require(name);
  }, exports);
  return exports;
}

// Exercise the real router and authenticated procedure with database I/O replaced.
const trpc = loadModule("../../../server/api/trpc.ts", {
  "~/features/auth": {},
  "~/server/db": {},
});
const { serverRouter } = loadModule("./router.ts", {
  "~/features/friend/server/blocking": blocking,
  "~/features/profile/presence": presence,
  "~/features/chat/server/message-idempotency": messageIdempotency,
  "~/features/chat/message-page": messagePage,
  "~/features/server/server/message-permissions": messagePermissions,
  "~/features/server/server/server-overview": serverOverview,
  "~/server/api/rate-limit": {},
  "~/server/chat-events": {},
  "~/server/api/trpc": trpc,
  "~/lib/input": input,
  "~/lib/static-image": staticImage,
  "~/features/notification/server/push": {},
});

function makeMember(id, role = "MEMBER", lastSeenAt = new Date()) {
  return {
    id: `membership-${id}`,
    userId: id,
    serverId: "server",
    role,
    bio: `private bio of ${id}`,
    nickname: `nickname-${id}`,
    createdAt: new Date(),
    user: {
      id,
      userId: `public_${id}`,
      name: `Name ${id}`,
      lastSeenAt,
      presenceStatus: "DND",
    },
  };
}

function makeDatabase(members, blocks = []) {
  return {
    chatServer: {
      findFirst: async ({ where }) => {
        const viewerId = where.members.some.userId;
        return where.id === "server" &&
          members.some(({ userId }) => userId === viewerId)
          ? { members: structuredClone(members) }
          : null;
      },
    },
    userBlock: {
      findMany: async ({ where }) =>
        blocks.filter((block) =>
          where.OR.some((condition) =>
            Object.entries(condition).every(
              ([key, value]) => block[key] === value,
            ),
          ),
        ),
    },
  };
}

for (const role of ["OWNER", "ADMIN", "MEMBER", "READ_ONLY"]) {
  test(`member API hides profiles for blocks in either direction (${role})`, async () => {
    const members = [
      makeMember("viewer", role),
      makeMember("outgoing"),
      makeMember("incoming"),
      makeMember("visible"),
      makeMember("stale", "MEMBER", new Date(0)),
    ];
    const db = makeDatabase(members, [
      { blockerId: "viewer", blockedId: "outgoing" },
      { blockerId: "incoming", blockedId: "viewer" },
      { blockerId: "visible", blockedId: "someone_else" },
    ]);
    const caller = serverRouter.createCaller({
      db,
      session: { user: { id: "viewer" } },
    });
    const result = await caller.getMembers({ serverId: "server" });

    assert.equal(result.length, members.length);
    for (const id of ["outgoing", "incoming"]) {
      const member = result.find(({ userId }) => userId === id);
      assert.equal(member.bio, null);
      assert.equal(member.nickname, null);
      assert.equal(member.user.presenceStatus, "INVISIBLE");
      assert.equal(member.id, `membership-${id}`);
      assert.equal(member.role, "MEMBER");
      assert.equal(member.user.name, `Name ${id}`);
      assert.equal(member.user.userId, `public_${id}`);
    }
    for (const id of ["viewer", "visible"]) {
      const member = result.find(({ userId }) => userId === id);
      assert.equal(member.bio, `private bio of ${id}`);
      assert.equal(member.nickname, `nickname-${id}`);
      assert.equal(member.user.presenceStatus, "DND");
    }
    assert.equal(
      result.find(({ userId }) => userId === "stale").user.presenceStatus,
      "INVISIBLE",
    );
    for (const member of result) {
      assert.ok(!("lastSeenAt" in member.user));
      assert.equal(
        member.user.image,
        `/api/profile/icon/${member.user.userId}`,
      );
    }
    assert.equal(members[1].bio, "private bio of outgoing");
  });
}

test("member API restores the server profile after unblocking", async () => {
  const blocks = [{ blockerId: "peer", blockedId: "viewer" }];
  const db = makeDatabase([makeMember("viewer"), makeMember("peer")], blocks);
  const caller = serverRouter.createCaller({
    db,
    session: { user: { id: "viewer" } },
  });
  const blocked = await caller.getMembers({ serverId: "server" });
  assert.equal(blocked[1].bio, null);

  blocks.pop();
  const unblocked = await caller.getMembers({ serverId: "server" });
  assert.equal(unblocked[1].bio, "private bio of peer");
  assert.equal(unblocked[1].nickname, "nickname-peer");
  assert.equal(unblocked[1].user.presenceStatus, "DND");
});

test("member API requires authentication and server membership", async () => {
  const db = makeDatabase([makeMember("viewer")]);
  await assert.rejects(
    serverRouter.createCaller({ db, session: null }).getMembers({
      serverId: "server",
    }),
    { code: "UNAUTHORIZED" },
  );
  await assert.rejects(
    serverRouter
      .createCaller({ db, session: { user: { id: "outsider" } } })
      .getMembers({ serverId: "server" }),
    { code: "NOT_FOUND" },
  );
});
