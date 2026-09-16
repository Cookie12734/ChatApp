import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { createTRPCClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../src/server/api/root";
import { createRateLimitKey } from "../src/server/rate-limit-policy";
import { createMatchingTopicVector } from "../src/features/chat/server/matching-content";
import {
  getChatEventRecord,
  publishChatEvent,
} from "../src/server/chat-events";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const userIdRunId = runId.replaceAll("-", "_");
const password = "Connect-e2e-123";
const ownerEmail = `codex-e2e-owner-${runId}@example.com`;
const memberEmail = `codex-e2e-member-${runId}@example.com`;
const serverName = `Codex E2E ${runId}`;

let ownerId = "";
let memberId = "";
let serverId = "";
let channelId = "";
let groupId = "";
const chatEventIds: bigint[] = [];

async function login(page: Page, email = ownerEmail) {
  // Each case exercises login independently for this run's synthetic users.
  await prisma.rateLimitBucket.deleteMany({
    where: { key: createRateLimitKey("auth:login:email", email) },
  });
  const callbackUrl = `/?serverId=${serverId}`;
  await page.goto(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("textarea[data-chat-input]")).toBeEnabled({
    timeout: 15_000,
  });
}

function apiClient(page: Page) {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: "http://localhost:3000/api/trpc",
        transformer: superjson,
        headers: async () => ({
          cookie: (await page.context().cookies())
            .map(({ name, value }) => `${name}=${value}`)
            .join("; "),
        }),
      }),
    ],
  });
}

async function openGroup(page: Page) {
  if (
    !(await page
      .getByRole("button", { name: "グループDMを開く", exact: true })
      .isVisible())
  ) {
    await page.goto("/");
  }
  await page
    .getByRole("button", { name: "グループDMを開く", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "グループDM", exact: true });
  await expect(dialog.getByPlaceholder("グループへメッセージ")).toBeVisible();
  return dialog;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 4);
  const [owner, member] = await Promise.all([
    prisma.user.create({
      data: {
        email: ownerEmail,
        emailVerified: new Date(),
        name: "E2E Owner",
        passwordHash,
        userId: `e2e_owner_${userIdRunId}`,
      },
    }),
    prisma.user.create({
      data: {
        email: memberEmail,
        emailVerified: new Date(),
        name: "E2E Member",
        passwordHash,
        userId: `e2e_member_${userIdRunId}`,
      },
    }),
  ]);
  ownerId = owner.id;
  memberId = member.id;

  const server = await prisma.chatServer.create({
    data: {
      createdById: ownerId,
      name: serverName,
      channels: { create: { name: "general" } },
      members: {
        create: [
          { role: "OWNER", userId: ownerId },
          { role: "MEMBER", userId: memberId },
        ],
      },
    },
    include: { channels: true },
  });
  serverId = server.id;
  channelId = server.channels[0]?.id ?? "";

  await prisma.friendship.createMany({
    data: [
      { friendId: memberId, userId: ownerId },
      { friendId: ownerId, userId: memberId },
    ],
  });

  await prisma.serverMessage.createMany({
    data: Array.from({ length: 36 }, (_, index) => ({
      channelId,
      content: `履歴メッセージ ${index + 1}`,
      createdAt: new Date(Date.now() - (36 - index) * 1_000),
      senderId: memberId,
      serverId,
    })),
  });
  await prisma.serverChannelRead.create({
    data: { channelId, readAt: new Date(), userId: ownerId },
  });
  const group = await prisma.groupConversation.create({
    data: {
      createdById: ownerId,
      name: `audit-group-${runId}`,
      members: {
        create: [{ userId: ownerId, role: "OWNER" }, { userId: memberId }],
      },
    },
  });
  groupId = group.id;
  await prisma.groupMessage.createMany({
    data: Array.from({ length: 105 }, (_, index) => ({
      groupId,
      senderId: memberId,
      content: `group-history-${index + 1}`,
      createdAt: new Date(Date.now() - (105 - index) * 1000),
    })),
  });
});

test.afterAll(async () => {
  if (chatEventIds.length > 0) {
    await prisma.chatEvent.deleteMany({ where: { id: { in: chatEventIds } } });
  }
  if (serverId) {
    await prisma.chatServer.deleteMany({ where: { id: serverId } });
  }
  if (groupId)
    await prisma.groupConversation.deleteMany({ where: { id: groupId } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
  await prisma.$disconnect();
});

test("送信待ちのメッセージを灰色で即時表示する", async ({ page }) => {
  await login(page);
  await page.route("**/api/trpc/**server.sendMessage**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await route.continue();
  });

  const content = `optimistic-${runId}`;
  const input = page.locator("textarea[data-chat-input]");
  await input.fill(content);
  await input.press("Enter");

  const pendingMessage = page
    .locator('article[aria-live="polite"]')
    .filter({ hasText: content });
  await expect(pendingMessage).toHaveClass(/text-connect-neutral/);
  await expect(pendingMessage.getByText("送信中", { exact: true })).toHaveCount(
    1,
  );
  await expect(pendingMessage).toHaveCount(0, { timeout: 10_000 });
  await expect(pendingMessage.getByText("送信中", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.locator("article").filter({ hasText: content }),
  ).toHaveCount(1);

  const followupContent = `optimistic-followup-${runId}`;
  await input.fill(followupContent);
  await input.press("Enter");

  const followupMessage = page
    .locator('article[aria-live="polite"]')
    .filter({ hasText: followupContent });
  await expect(followupMessage).toHaveClass(/text-connect-neutral/);
  await expect(
    followupMessage.getByText("送信中", { exact: true }),
  ).toHaveCount(1);
  await expect(followupMessage.locator("time")).toHaveCount(0);
  await expect(
    followupMessage.getByRole("button", { name: /プロフィールを開く/ }),
  ).toHaveCount(0);
  await expect(
    followupMessage.getByText("E2E Owner", { exact: true }),
  ).toHaveCount(0);
  await expect(followupMessage).toHaveCount(0, { timeout: 10_000 });
  await expect(
    followupMessage.getByText("送信中", { exact: true }),
  ).toHaveCount(0);
});

test("スクロール中の新着件数と未読線を表示する", async ({ page }) => {
  await login(page);
  const viewport = page.locator("[data-chat-viewport]");
  await expect
    .poll(() =>
      viewport.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true);
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await page.waitForTimeout(700);

  const content = `new-message-${runId}`;
  const newMessage = await prisma.serverMessage.create({
    data: { channelId, content, senderId: memberId, serverId },
  });
  const event = await prisma.chatEvent.create({
    data: {
      audienceIds: [],
      kind: "server",
      serverId,
      payload: {
        change: "created",
        channelId,
        kind: "server",
        messageId: newMessage.id,
        senderId: memberId,
        serverId,
      },
    },
  });
  chatEventIds.push(event.id);

  const newMessageButton = page.getByRole("button", {
    name: "新しいメッセージ 1件",
  });
  await expect(newMessageButton).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("separator", { name: "ここから新しいメッセージ" }),
  ).toHaveCount(1);
  await expect(page.getByText(content)).toBeVisible();

  await newMessageButton.click();
  await expect(newMessageButton).toHaveCount(0, { timeout: 10_000 });
});

test("既読更新に失敗しても同じメッセージを再試行する", async ({ page }) => {
  const retryMessage = await prisma.serverMessage.create({
    data: {
      channelId,
      content: `read-retry-${runId}`,
      senderId: memberId,
      serverId,
    },
  });
  let attempts = 0;

  await page.route("**/api/trpc/**server.markChannelRead**", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await login(page);
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(1);

  const viewport = page.locator("[data-chat-viewport]");
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await page.waitForTimeout(100);
  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  await expect.poll(() => attempts).toBeGreaterThanOrEqual(2);
  await expect
    .poll(async () => {
      const read = await prisma.serverChannelRead.findUnique({
        where: { channelId_userId: { channelId, userId: ownerId } },
      });
      return Boolean(read && read.readAt >= retryMessage.createdAt);
    })
    .toBe(true);
});

test("グループDMの過去ログと相手の新着が時系列で表示される", async ({
  page,
}) => {
  await login(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "グループDMを開く", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "グループDM", exact: true });
  await expect(
    dialog.locator("article").getByText("group-history-105", { exact: true }),
  ).toHaveCount(1);
  await dialog.getByRole("button", { name: /過去のメッセージ/ }).click();
  await expect(dialog.locator("article").first()).toContainText(
    "group-history-1",
  );
  await expect(dialog.locator("article").last()).toContainText(
    "group-history-105",
  );
  const content = `group-incoming-${runId}`;
  await prisma.groupMessage.create({
    data: { groupId, senderId: memberId, content },
  });
  const event = await prisma.chatEvent.create({
    data: {
      kind: "group",
      audienceIds: [ownerId, memberId],
      payload: { kind: "group", groupId, userIds: [ownerId, memberId] },
    },
  });
  chatEventIds.push(event.id);
  await expect(
    dialog.locator("article").getByText(content, { exact: true }),
  ).toBeVisible({
    timeout: 10000,
  });
  await expect(dialog.locator("article").last()).toContainText(content);
});

test("SSE接続を60秒以上維持し、会話の定期再取得なしでチャンネル変更を取得する", async ({
  page,
}) => {
  test.setTimeout(100000);
  let connections = 0;
  let conversations = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/chat/events") connections += 1;
    if (url.pathname.includes("server.getConversation")) conversations += 1;
  });
  await login(page);
  await expect.poll(() => connections).toBe(1);
  await expect(
    page.getByText("履歴メッセージ 36", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1000);
  const initialConversations = conversations;
  const channel = await prisma.serverChannel.create({
    data: { serverId, name: `audit-${runId}` },
  });
  try {
    await expect(
      page.getByRole("button", { name: channel.name, exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(65000);
    expect(connections).toBe(1);
    expect(conversations).toBe(initialConversations);
  } finally {
    await prisma.serverChannel.deleteMany({ where: { id: channel.id } });
  }
});

test("下書きはアカウントを切り替えても他のユーザーへ表示しない", async ({
  page,
}) => {
  await login(page);
  await page.evaluate(
    ({ channelId, groupId }) => {
      localStorage.setItem(
        `connect:draft:server:${channelId}`,
        "legacy server secret",
      );
      localStorage.setItem(
        `connect:draft:group:${groupId}`,
        "legacy group secret",
      );
    },
    { channelId, groupId },
  );
  await page.reload();
  const serverInput = page.locator("textarea[data-chat-input]");
  await expect(serverInput).toHaveValue("");
  await serverInput.fill("owner server draft");
  await expect
    .poll(() =>
      page.evaluate(
        (key) => localStorage.getItem(key),
        `connect:draft:${ownerId}:server:${channelId}`,
      ),
    )
    .toBe("owner server draft");
  let dialog = await openGroup(page);
  await expect(dialog.getByPlaceholder("グループへメッセージ")).toHaveValue("");
  await dialog
    .getByPlaceholder("グループへメッセージ")
    .fill("owner group draft");
  await expect
    .poll(() =>
      page.evaluate(
        (key) => localStorage.getItem(key),
        `connect:draft:${ownerId}:group:${groupId}`,
      ),
    )
    .toBe("owner group draft");

  await page.context().clearCookies();
  await login(page, memberEmail);
  await expect(serverInput).toHaveValue("");
  dialog = await openGroup(page);
  await expect(dialog.getByPlaceholder("グループへメッセージ")).toHaveValue("");

  await page.context().clearCookies();
  await login(page);
  await expect(serverInput).toHaveValue("owner server draft");
  dialog = await openGroup(page);
  await expect(dialog.getByPlaceholder("グループへメッセージ")).toHaveValue(
    "owner group draft",
  );
});

test("グループの返信引用にも双方向のブロックを適用する", async ({ page }) => {
  await login(page);
  const client = apiClient(page);
  const original = await prisma.groupMessage.create({
    data: { groupId, senderId: memberId, content: "blocked quote" },
  });
  const reply = await prisma.groupMessage.create({
    data: {
      groupId,
      senderId: ownerId,
      content: "visible reply",
      replyToId: original.id,
    },
  });
  const hiddenPreview = await prisma.groupMessage.create({
    data: {
      groupId,
      senderId: memberId,
      content: "blocked preview",
      createdAt: new Date(Date.now() + 1000),
    },
  });
  for (const [blockerId, blockedId] of [
    [ownerId, memberId],
    [memberId, ownerId],
  ] as const) {
    const block = await prisma.userBlock.create({
      data: { blockerId, blockedId },
    });
    try {
      const conversation = await client.group.getConversation.query({
        groupId,
      });
      expect(
        conversation.messages.find(({ id }) => id === original.id),
      ).toBeUndefined();
      expect(
        conversation.messages.find(({ id }) => id === reply.id)?.replyTo,
      ).toBeNull();
      const overview = await client.group.list.query();
      expect(
        overview.groups.find(({ id }) => id === groupId)?.lastMessage?.id,
      ).toBe(reply.id);
    } finally {
      await prisma.userBlock.delete({ where: { id: block.id } });
    }
  }
  const conversation = await client.group.getConversation.query({ groupId });
  expect(
    conversation.messages.find(({ id }) => id === reply.id)?.replyTo?.content,
  ).toBe("blocked quote");
  const overview = await client.group.list.query();
  expect(
    overview.groups.find(({ id }) => id === groupId)?.lastMessage?.id,
  ).toBe(hiddenPreview.id);
});

test("グループ送信の応答が失われても再送で重複しない", async ({ page }) => {
  await login(page);
  const dialog = await openGroup(page);
  const requests: string[] = [];
  await page.route("**/api/trpc/**group.sendMessage**", async (route) => {
    requests.push(route.request().postData() ?? "");
    if (requests.length === 1) {
      await route.fetch();
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  const content = `retry-group-${runId}`;
  const input = dialog.getByPlaceholder("グループへメッセージ");
  await input.fill(content);
  await dialog.getByRole("button", { name: "送信", exact: true }).click();
  await expect(dialog.getByRole("status", { name: "操作結果" })).toBeVisible();
  await expect(input).toHaveValue(content);
  await dialog.getByRole("button", { name: "送信", exact: true }).click();
  await expect(input).toHaveValue("");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toBe(requests[0]);
  expect(await prisma.groupMessage.count({ where: { groupId, content } })).toBe(
    1,
  );
});

test("グループのリアクションを別の参加者へSSEで反映する", async ({
  page,
  browser,
}) => {
  await login(page);
  const dialog = await openGroup(page);
  const target = await prisma.groupMessage.create({
    data: { groupId, senderId: memberId, content: `reaction-target-${runId}` },
  });
  // Refresh once to load the fixture; later updates must arrive through SSE.
  await page.reload();
  await openGroup(page);
  const article = dialog.locator("article").filter({ hasText: target.content });
  await expect(article).toBeVisible();
  const context = await browser.newContext();
  try {
    const peer = await context.newPage();
    await login(peer, memberEmail);
    const client = apiClient(peer);
    await client.group.toggleReaction.mutate({
      groupId,
      messageId: target.id,
      emoji: "👍",
    });
    await expect(
      article.getByRole("button", { name: "👍 1", exact: true }),
    ).toBeVisible();
    await client.group.toggleReaction.mutate({
      groupId,
      messageId: target.id,
      emoji: "👍",
    });
    await expect(
      article.getByRole("button", { name: "👍 1", exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("全チャットの再送で添付の変更と4件上限の迂回を拒否する", async ({
  page,
}) => {
  await login(page);
  const client = apiClient(page);
  const senders = [
    (input: { clientId: string; content: string; attachmentIds: string[] }) =>
      client.chat.sendMessage.mutate({ ...input, friendId: memberId }),
    (input: { clientId: string; content: string; attachmentIds: string[] }) =>
      client.server.sendMessage.mutate({ ...input, serverId, channelId }),
    (input: { clientId: string; content: string; attachmentIds: string[] }) =>
      client.group.sendMessage.mutate({ ...input, groupId }),
  ];
  for (const send of senders) {
    const attachments = await Promise.all(
      Array.from({ length: 5 }, () =>
        prisma.messageAttachment.create({
          data: {
            uploaderId: ownerId,
            kind: "LINK",
            externalUrl: "https://example.com/",
            fileName: "example.com",
            mimeType: "text/uri-list",
            size: 0,
            expiresAt: new Date(Date.now() + 3600000),
          },
        }),
      ),
    );
    const ids = attachments.map(({ id }) => id);
    const input = {
      clientId: crypto.randomUUID(),
      content: "attachment replay",
      attachmentIds: ids.slice(0, 4),
    };
    const message = await send(input);
    const eventWhere = {
      OR: [{ audienceIds: { has: ownerId } }, { serverId }],
    };
    const firstEventCount = await prisma.chatEvent.count({ where: eventWhere });
    expect(
      (
        await send({
          ...input,
          attachmentIds: [...input.attachmentIds].reverse(),
        })
      ).id,
    ).toBe(message.id);
    expect(await prisma.chatEvent.count({ where: eventWhere })).toBe(
      firstEventCount,
    );
    for (const changed of [[], ids.slice(0, 1), ids.slice(1), ids.slice(4)]) {
      await expect(
        send({ ...input, attachmentIds: changed }),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    }
    const stored = await prisma.messageAttachment.findMany({
      where: { id: { in: ids } },
    });
    expect(
      stored.filter(
        (item) =>
          item.directMessageId === message.id ||
          item.serverMessageId === message.id ||
          item.groupMessageId === message.id,
      ),
    ).toHaveLength(4);
    const empty = {
      ...input,
      clientId: crypto.randomUUID(),
      attachmentIds: [],
    };
    await send(empty);
    await expect(
      send({ ...empty, attachmentIds: ids.slice(4) }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  }
});

for (const kind of ["direct", "server"] as const) {
  test(`${kind}の送信応答が失われても再送で投稿と新着イベントを重複させない`, async ({
    page,
  }) => {
    await login(page);
    if (kind === "direct") {
      let release!: () => void;
      const loaded = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(
        "**/api/trpc/**chat.getConversation**",
        async (route) => {
          await loaded;
          await route.continue();
        },
        { times: 1 },
      );
      try {
        await page.goto("/");
        await expect(page.locator("textarea[data-chat-input]")).toBeDisabled();
      } finally {
        release();
      }
    }
    const input = page.locator("textarea[data-chat-input]");
    await expect(input).toBeEnabled();
    const procedure =
      kind === "direct" ? "chat.sendMessage" : "server.sendMessage";
    const requests: unknown[] = [];
    await page.route(
      (url) =>
        url.pathname.slice("/api/trpc/".length).split(",").includes(procedure),
      async (route) => {
        const url = new URL(route.request().url());
        const index = url.pathname
          .slice("/api/trpc/".length)
          .split(",")
          .indexOf(procedure);
        const payload = route.request().postDataJSON() as Record<
          string,
          unknown
        >;
        requests.push(
          url.searchParams.get("batch") === "1" ? payload[index] : payload,
        );
        if (requests.length === 1) {
          await route.fetch();
          await route.abort("failed");
        } else {
          await route.continue();
        }
      },
    );
    const content = `retry-${kind}-${runId}`;
    await input.fill(content);
    await input.press("Enter");
    await expect.poll(() => requests.length).toBe(1);
    await expect(input).toHaveValue(content);
    await input.press("Enter");
    await expect(
      page.locator('article[aria-live="polite"]').filter({ hasText: content }),
    ).toHaveCount(0);
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]).toEqual(requests[0]);
    const messages =
      kind === "direct"
        ? await prisma.directMessage.findMany({
            where: { senderId: ownerId, content },
          })
        : await prisma.serverMessage.findMany({
            where: { senderId: ownerId, content },
          });
    expect(messages).toHaveLength(1);
    expect(
      await prisma.chatEvent.count({
        where: {
          kind,
          payload: { path: ["messageId"], equals: messages[0]!.id },
        },
      }),
    ).toBe(1);
  });
}

test("グループの作成・名前変更・招待・退出を別の参加者へ反映する", async ({
  page,
  browser,
}) => {
  await login(page);
  const client = apiClient(page);
  const third = await prisma.user.create({
    data: { userId: `e2e_third_${userIdRunId}`, name: "Third" },
  });
  let createdGroupId: string | undefined;
  const context = await browser.newContext();
  try {
    await prisma.friendship.create({
      data: { userId: ownerId, friendId: third.id },
    });
    const peer = await context.newPage();
    await login(peer, memberEmail);
    await peer.goto("/");
    const dialog = await openGroup(peer);
    const group = await client.group.create.mutate({
      memberIds: [memberId, third.id],
      name: `live-group-${runId}`,
    });
    createdGroupId = group.id;
    const groupButton = dialog
      .getByRole("button")
      .filter({ hasText: `live-group-${runId}` });
    await expect(groupButton).toBeVisible();
    await groupButton.click();
    const content = `removed-group-content-${runId}`;
    await client.group.sendMessage.mutate({
      groupId: group.id,
      content,
      clientId: crypto.randomUUID(),
    });
    await expect(
      dialog.locator("article").filter({ hasText: content }),
    ).toBeVisible();
    await client.group.update.mutate({
      groupId: group.id,
      name: `renamed-group-${runId}`,
    });
    await expect(
      dialog.getByText(`renamed-group-${runId}`, { exact: true }).first(),
    ).toBeVisible();
    await client.group.removeMember.mutate({ groupId: group.id, memberId });
    await expect(
      dialog.getByText(`renamed-group-${runId}`, { exact: true }),
    ).toHaveCount(0);
    await expect(
      dialog.locator("article").filter({ hasText: content }),
    ).toHaveCount(0);
    await client.group.addMembers.mutate({
      groupId: group.id,
      memberIds: [memberId],
    });
    await expect(
      dialog.getByText(`renamed-group-${runId}`, { exact: true }).first(),
    ).toBeVisible();
    await apiClient(peer).group.leave.mutate({ groupId: group.id });
    await expect(
      dialog.getByText(`renamed-group-${runId}`, { exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
    if (createdGroupId)
      await prisma.groupConversation.deleteMany({
        where: { id: createdGroupId },
      });
    await prisma.user.delete({ where: { id: third.id } });
  }
});

test("同じ添付の同時送信は一件だけ保存する", async ({ page }) => {
  await login(page);
  const client = apiClient(page);
  const attachment = await prisma.messageAttachment.create({
    data: {
      uploaderId: ownerId,
      kind: "LINK",
      externalUrl: "https://example.com/",
      fileName: "example.com",
      mimeType: "text/uri-list",
      size: 0,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const content = `concurrent-attachment-${runId}`;
  const results = await Promise.allSettled([
    client.server.sendMessage.mutate({
      serverId,
      channelId,
      content,
      clientId: crypto.randomUUID(),
      attachmentIds: [attachment.id],
    }),
    client.group.sendMessage.mutate({
      groupId,
      content,
      clientId: crypto.randomUUID(),
      attachmentIds: [attachment.id],
    }),
  ]);
  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  const counts = await Promise.all([
    prisma.serverMessage.count({ where: { serverId, content } }),
    prisma.groupMessage.count({ where: { groupId, content } }),
  ]);
  expect(counts[0] + counts[1]).toBe(1);
  const stored = await prisma.messageAttachment.findUniqueOrThrow({
    where: { id: attachment.id },
  });
  expect(
    [
      stored.directMessageId,
      stored.serverMessageId,
      stored.groupMessageId,
    ].filter(Boolean),
  ).toHaveLength(1);
});

test("既読APIは双方向のブロックと共通レート制限を適用する", async ({
  page,
}) => {
  await login(page);
  const client = apiClient(page);
  const message = await prisma.directMessage.create({
    data: { senderId: memberId, receiverId: ownerId, content: "read guard" },
  });
  const input = { friendId: memberId, messageId: message.id };
  for (const [blockerId, blockedId] of [
    [ownerId, memberId],
    [memberId, ownerId],
  ] as const) {
    const block = await prisma.userBlock.create({
      data: { blockerId, blockedId },
    });
    try {
      await expect(
        client.chat.markConversationRead.mutate(input),
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      expect(
        (
          await prisma.directMessage.findUniqueOrThrow({
            where: { id: message.id },
          })
        ).readAt,
      ).toBeNull();
    } finally {
      await prisma.userBlock.delete({ where: { id: block.id } });
    }
  }
  const key = createRateLimitKey("chat:read:user", ownerId);
  const limit = { count: 120, resetAt: new Date(Date.now() + 60000) };
  await prisma.rateLimitBucket.upsert({
    where: { key },
    create: { key, ...limit },
    update: limit,
  });
  try {
    await expect(
      client.chat.markConversationRead.mutate(input),
    ).rejects.toMatchObject({ data: { code: "TOO_MANY_REQUESTS" } });
    await expect(
      client.server.markChannelRead.mutate({
        serverId,
        channelId,
        messageId: "unused",
      }),
    ).rejects.toMatchObject({ data: { code: "TOO_MANY_REQUESTS" } });
    expect(
      (
        await prisma.directMessage.findUniqueOrThrow({
          where: { id: message.id },
        })
      ).readAt,
    ).toBeNull();
  } finally {
    await prisma.rateLimitBucket.deleteMany({ where: { key } });
  }
  await client.chat.markConversationRead.mutate(input);
  expect(
    (
      await prisma.directMessage.findUniqueOrThrow({
        where: { id: message.id },
      })
    ).readAt,
  ).not.toBeNull();
});

test("グループ送信の完了時に編集中の下書きを消さない", async ({ page }) => {
  await login(page);
  const dialog = await openGroup(page);
  const input = dialog.getByPlaceholder("グループへメッセージ");
  for (const edit of [false, true]) {
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    await page.route("**/api/trpc/**group.sendMessage**", async (route) => {
      const response = await route.fetch();
      requestStarted();
      await responseGate;
      await route.fulfill({ response });
    });
    const content = `draft-in-flight-${edit}-${runId}`;
    await input.fill(content);
    await input.press("Enter");
    await started;
    if (edit) {
      await input.fill("次の文章");
      // Even retyping the sent text is a new edit, not the submitted draft.
      await input.fill(content);
    }
    releaseResponse();
    if (edit)
      await expect(
        dialog.getByRole("button", { name: "送信", exact: true }),
      ).toBeEnabled();
    await expect(input).toHaveValue(edit ? content : "");
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        `connect:draft:${ownerId}:group:${groupId}`,
      ),
    ).toBe(edit ? content : null);
    await page.unroute("**/api/trpc/**group.sendMessage**");
  }
});

test("スマホでグループ一覧へ戻り、会話を開くと最新位置を表示する", async ({
  page,
}) => {
  await login(page);
  const dialog = await openGroup(page);
  await page.setViewportSize({ width: 375, height: 550 });
  // Reopen after resizing to exercise the initial mobile scroll position.
  await dialog
    .getByRole("button", { name: "グループ一覧", exact: true })
    .click();
  await expect(dialog.locator("aside")).toBeVisible();
  await expect(dialog.getByPlaceholder("グループへメッセージ")).toHaveCount(0);
  const group = await prisma.groupConversation.findUniqueOrThrow({
    where: { id: groupId },
  });
  await dialog
    .locator("aside")
    .getByRole("button")
    .filter({ hasText: group.name! })
    .click();
  const scroll = dialog.locator(".chat-scrollbar");
  await expect
    .poll(() =>
      scroll.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop),
    )
    .toBeLessThanOrEqual(1);
  await scroll.evaluate((el) => {
    el.scrollTop = 0;
  });
  await dialog
    .getByPlaceholder("グループへメッセージ")
    .fill("スクロール位置を維持");
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(0);
});

test("グループの日時と操作メニューを狭い画面でも利用できる", async ({
  page,
}) => {
  const firstDay = new Date();
  firstDay.setDate(firstDay.getDate() + 3);
  firstDay.setHours(10, 0, 0, 0);
  const secondDay = new Date(firstDay);
  secondDay.setDate(secondDay.getDate() + 1);
  const content = `ui-message-${runId}`;
  await prisma.groupMessage.createMany({
    data: [firstDay, new Date(firstDay.getTime() + 60000), secondDay].map(
      (createdAt, index) => ({
        groupId,
        senderId: memberId,
        content: `${content}-${index}`,
        createdAt,
      }),
    ),
  });
  await login(page);
  const dialog = await openGroup(page);
  const input = dialog.getByPlaceholder("グループへメッセージ");
  const article = dialog.locator("article").filter({ hasText: `${content}-0` });
  await expect(article.locator("time")).toHaveAttribute(
    "datetime",
    firstDay.toISOString(),
  );
  const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  for (const day of [firstDay, secondDay]) {
    await expect(
      dialog.getByText(dateFormatter.format(day), { exact: true }),
    ).toHaveCount(1);
  }
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await input.focus();
    await expect(dialog.locator("[data-chat-composer]")).toHaveCSS(
      "outline-width",
      "2px",
    );
    expect(
      await article.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    const trigger = article.getByRole("button", { name: "その他の操作" });
    await trigger.focus();
    await trigger.press("Enter");
    const quote = page.getByRole("menuitem", { name: "引用", exact: true });
    await expect(quote).toBeFocused();
    const menuBounds = await page.getByRole("menu").boundingBox();
    expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(width);
    await quote.press("Escape");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await quote.click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(`> ${content}-0\n`);
    await input.fill("");
    await trigger.click();
    await page.getByRole("menuitem", { name: "保存", exact: true }).click();
    await trigger.click();
    await page.getByRole("menuitem", { name: "保存解除", exact: true }).click();
    await trigger.click();
    await page.getByRole("menuitem", { name: "通報", exact: true }).click();
    const report = page.getByRole("dialog", {
      name: "メッセージを通報",
      exact: true,
    });
    await expect(report).toBeVisible();
    await report
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();
    await expect(report).toHaveCount(0);
  }
});

test("共通入力欄とグループで変換中は送信せずEnterで送信する", async ({
  page,
}) => {
  await login(page);
  for (const kind of ["server", "group"] as const) {
    const container = kind === "group" ? await openGroup(page) : page;
    const input = container.locator("textarea[data-chat-input]");
    const requests: string[] = [];
    await page.route(`**/api/trpc/**${kind}.sendMessage**`, async (route) => {
      requests.push(route.request().postData() ?? "");
      await route.continue();
    });
    const content = `keyboard-${kind}-${runId}`;
    await input.fill(content);
    await expect(container.locator("[data-chat-composer]")).toHaveCSS(
      "outline-width",
      "2px",
    );
    await input.dispatchEvent("keydown", {
      key: "Enter",
      isComposing: true,
      bubbles: true,
    });
    await input.dispatchEvent("keydown", {
      key: "Enter",
      keyCode: 229,
      bubbles: true,
    });
    await expect(input).toHaveValue(content);
    await input.press("Shift+Enter");
    await expect(input).toHaveValue(`${content}\n`);
    expect(requests).toHaveLength(0);
    await input.press("Enter");
    await expect.poll(() => requests.length).toBe(1);
    await expect(input).toHaveValue("");
  }
});

test("リアルタイム切断時は定期更新への切り替えを表示する", async ({ page }) => {
  await page.route("**/api/chat/events", (route) => route.abort("failed"));
  await login(page);
  await expect(page.getByRole("status", { name: "接続状態" })).toContainText(
    "再接続中",
  );
  const dialog = await openGroup(page);
  await expect(dialog.getByRole("status", { name: "接続状態" })).toContainText(
    "定期的に更新",
  );
});

test("再マッチは成立済みの同意を再利用せず解除とブロックで希望を取り消す", async ({
  page,
  browser,
}) => {
  const now = new Date();
  const match = await prisma.matchingResult.create({
    data: {
      firstUserId: ownerId,
      secondUserId: memberId,
      topic: "GAME",
      rematchRequest: {
        create: {
          firstUserRequestedAt: now,
          secondUserRequestedAt: now,
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "MATCHED",
        },
      },
    },
  });
  const member = await prisma.user.findUniqueOrThrow({
    where: { id: memberId },
  });
  const memberContext = await browser.newContext();
  try {
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: ownerId, friendId: memberId },
          { userId: memberId, friendId: ownerId },
        ],
      },
    });
    await login(page);
    const client = apiClient(page);
    expect(
      (await client.chat.requestRematch.mutate({ matchId: match.id })).status,
    ).toBe("requested");
    expect(
      await prisma.friendship.count({
        where: { userId: ownerId, friendId: memberId },
      }),
    ).toBe(0);
    const memberPage = await memberContext.newPage();
    await login(memberPage, memberEmail);
    expect(
      (
        await apiClient(memberPage).chat.requestRematch.mutate({
          matchId: match.id,
        })
      ).status,
    ).toBe("matched");
    await client.friend.removeFriend.mutate({ userId: member.userId });
    expect(
      await prisma.rematchRequest.findUnique({
        where: { matchingResultId: match.id },
      }),
    ).toBeNull();
    expect(
      (await client.chat.requestRematch.mutate({ matchId: match.id })).status,
    ).toBe("requested");
    await client.friend.blockUser.mutate({ userId: member.userId });
    expect(
      await prisma.rematchRequest.findUnique({
        where: { matchingResultId: match.id },
      }),
    ).toBeNull();
  } finally {
    await memberContext.close();
    await prisma.matchingResult.delete({ where: { id: match.id } });
    await prisma.userBlock.deleteMany({
      where: { blockerId: ownerId, blockedId: memberId },
    });
    await prisma.friendship.createMany({
      data: [
        { userId: ownerId, friendId: memberId },
        { userId: memberId, friendId: ownerId },
      ],
      skipDuplicates: true,
    });
    await prisma.groupConversationMember.createMany({
      data: [{ groupId, userId: memberId }],
      skipDuplicates: true,
    });
  }
});

test("別トピックで分析を拒否した後の発言を過去の同意へ含めない", async ({
  page,
}) => {
  const start = new Date(Date.now() - 7_200_000);
  const next = new Date(Date.now() - 3_600_000);
  const games = "マインクラフトの建築が好きです";
  const matchIds: string[] = [];
  const messageIds: string[] = [];
  try {
    for (const [topic, consent, createdAt] of [
      ["GAME", true, start],
      ["WORRIES", false, next],
    ] as const) {
      matchIds.push(
        (
          await prisma.matchingResult.create({
            data: {
              firstUserId: ownerId,
              secondUserId: memberId,
              topic,
              createdAt,
              firstUserConversationConsent: consent,
            },
          })
        ).id,
      );
    }
    for (const [content, createdAt] of [
      [games, new Date(start.getTime() + 1000)],
      ["分析に含めない仕事の悩みです", new Date(next.getTime() + 1000)],
    ] as const) {
      messageIds.push(
        (
          await prisma.directMessage.create({
            data: {
              senderId: ownerId,
              receiverId: memberId,
              content,
              createdAt,
            },
          })
        ).id,
      );
    }
    await login(page);
    const client = apiClient(page);
    await prisma.matchingQueue.create({
      data: {
        userId: ownerId,
        topic: "GAME",
        matchedUserId: memberId,
        matchingResultId: matchIds[0],
      },
    });
    await client.chat.matchRandom.mutate({ topic: "GAME" });
    const profile = await prisma.matchingTopicProfile.findUniqueOrThrow({
      where: { userId_topic: { userId: ownerId, topic: "GAME" } },
    });
    expect(profile.sampleCount).toBe(1);
    expect(profile.vector).toEqual(createMatchingTopicVector([games]));
    await client.chat.cancelMatching.mutate();
  } finally {
    await prisma.matchingQueue.deleteMany({ where: { userId: ownerId } });
    await prisma.matchingResult.deleteMany({ where: { id: { in: matchIds } } });
    await prisma.directMessage.deleteMany({
      where: { id: { in: messageIds } },
    });
    await prisma.matchingTopicProfile.deleteMany({
      where: { userId: ownerId },
    });
  }
});

test("共有グループの所有者を削除して他の参加者の履歴を消せない", async ({
  page,
}) => {
  const actor = await prisma.user.create({
    data: {
      email: `delete-guard-${runId}@example.com`,
      emailVerified: new Date(),
      userId: `delete_guard_${userIdRunId}`,
      name: "Deletion Guard",
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
  const group = await prisma.groupConversation.create({
    data: {
      createdById: actor.id,
      name: `delete-guard-${runId}`,
      members: {
        create: [{ userId: actor.id, role: "OWNER" }, { userId: memberId }],
      },
      messages: {
        create: { senderId: memberId, content: "残すべき他の参加者の発言" },
      },
    },
  });
  try {
    await page.goto("/auth/login?callbackUrl=%2Fprofile");
    await page.getByLabel("メールアドレス").fill(actor.email!);
    await page.getByLabel("パスワード").fill(password);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(
      page.getByText(
        "所有中のグループDMに他のメンバーがいる場合も削除できません。",
        { exact: false },
      ),
    ).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    await page
      .getByRole("textbox", { name: /確認のため現在のユーザーID/ })
      .fill(actor.userId);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    page.once("dialog", (dialog) => void dialog.accept());
    await page
      .getByRole("button", { name: "アカウントを削除", exact: true })
      .click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "所有中のグループDMに他のメンバーがいるため削除できません",
    );
    expect(await prisma.user.count({ where: { id: actor.id } })).toBe(1);
    expect(
      await prisma.groupMessage.count({
        where: { groupId: group.id, senderId: memberId },
      }),
    ).toBe(1);
  } finally {
    await prisma.groupConversation.deleteMany({ where: { id: group.id } });
    await prisma.user.deleteMany({ where: { id: actor.id } });
  }
});

test("添付の完了前にグループを切り替えても別の会話へ追加しない", async ({
  page,
}) => {
  const other = await prisma.groupConversation.create({
    data: {
      createdById: ownerId,
      name: `other-upload-${runId}`,
      members: {
        create: [{ userId: ownerId, role: "OWNER" }, { userId: memberId }],
      },
    },
  });
  let releaseUpload!: () => void;
  let requestStarted!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  try {
    await login(page);
    const dialog = await openGroup(page);
    await dialog
      .getByRole("button", { name: new RegExp(`audit-group-${runId}`) })
      .click();
    await page.route("**/api/attachments", async (route) => {
      requestStarted();
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          attachment: {
            id: "late-private-file",
            fileName: "private.pdf",
            kind: "PDF",
            mimeType: "application/pdf",
            size: 10,
            url: "/api/attachments/late-private-file",
          },
        }),
      });
    });
    await dialog.locator('input[aria-label="ファイルを追加"]').setInputFiles({
      name: "private.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7"),
    });
    await started;
    await dialog.getByRole("button", { name: new RegExp(other.name!) }).click();
    const response = page.waitForResponse("**/api/attachments");
    releaseUpload();
    await (await response).finished();
    await expect(
      dialog.getByRole("heading", { name: other.name!, exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("list", { name: "選択済みの添付" }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "送信", exact: true }),
    ).toBeDisabled();
    const content = `safe-upload-switch-${runId}`;
    const input = dialog.getByPlaceholder("グループへメッセージ");
    await input.fill(content);
    await input.press("Enter");
    await expect
      .poll(() =>
        prisma.groupMessage.count({ where: { groupId: other.id, content } }),
      )
      .toBe(1);
  } finally {
    releaseUpload();
    await page.unroute("**/api/attachments");
    await prisma.groupConversation.deleteMany({ where: { id: other.id } });
  }
});

test("イベントの採番と確定を直列化して小さいIDの取りこぼしを防ぐ", async () => {
  const firstMessage = `ordered-first-${runId}`;
  const secondMessage = `ordered-second-${runId}`;
  let release!: () => void;
  let inserted!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    inserted = resolve;
  });
  const first = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(1163281236, 1)::text`;
      const event = await tx.chatEvent.create({
        data: getChatEventRecord({
          kind: "direct",
          change: "created",
          messageId: firstMessage,
          userIds: [ownerId],
        }),
      });
      inserted();
      await gate;
      return event;
    },
    { timeout: 15000 },
  );
  let second: Promise<void> | undefined;
  try {
    await ready;
    second = publishChatEvent(prisma, {
      kind: "direct",
      change: "created",
      messageId: secondMessage,
      userIds: [ownerId],
    });
    await expect
      .poll(async () => {
        const locks = await prisma.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) AS count FROM pg_locks WHERE locktype = 'advisory' AND classid = 1163281236 AND objid = 1 AND NOT granted`;
        return Number(locks[0]?.count ?? 0);
      })
      .toBeGreaterThan(0);
    expect(
      await prisma.chatEvent.count({
        where: { payload: { path: ["messageId"], equals: secondMessage } },
      }),
    ).toBe(0);
    release();
    const firstEvent = await first;
    await second;
    const secondEvent = await prisma.chatEvent.findFirstOrThrow({
      where: { payload: { path: ["messageId"], equals: secondMessage } },
    });
    expect(secondEvent.id > firstEvent.id).toBe(true);
  } finally {
    release();
    await Promise.allSettled([first, second]);
    await prisma.chatEvent.deleteMany({
      where: {
        OR: [firstMessage, secondMessage].map((messageId) => ({
          payload: { path: ["messageId"], equals: messageId },
        })),
      },
    });
  }
});

test("期限切れの待機をマッチ対象にせずハートビートでも復活させない", async ({
  page,
  browser,
}) => {
  const peerContext = await browser.newContext();
  const stale = new Date(Date.now() - 120000);
  try {
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: ownerId, friendId: memberId },
          { userId: memberId, friendId: ownerId },
        ],
      },
    });
    await prisma.matchingQueue.create({
      data: { userId: memberId, topic: "WORRIES", updatedAt: stale },
    });
    await login(page);
    const peer = await peerContext.newPage();
    await login(peer, memberEmail);
    const peerApi = apiClient(peer);
    expect((await peerApi.chat.getMatchingStatus.query()).status).toBe("idle");
    expect((await peerApi.chat.heartbeatMatching.mutate()).active).toBe(false);
    expect(
      (await apiClient(page).chat.matchRandom.mutate({ topic: "WORRIES" }))
        .status,
    ).toBe("waiting");
    expect(
      await prisma.friendship.count({
        where: { userId: ownerId, friendId: memberId },
      }),
    ).toBe(0);
    const older = new Date(Date.now() - 30000);
    await prisma.matchingQueue.update({
      where: { userId: ownerId },
      data: { updatedAt: older },
    });
    expect((await apiClient(page).chat.heartbeatMatching.mutate()).active).toBe(
      true,
    );
    expect(
      (
        await prisma.matchingQueue.findUniqueOrThrow({
          where: { userId: ownerId },
        })
      ).updatedAt > older,
    ).toBe(true);
    expect(
      (await peerApi.chat.matchRandom.mutate({ topic: "WORRIES" })).status,
    ).toBe("matched");
  } finally {
    await peerContext.close();
    await prisma.matchingQueue.deleteMany({
      where: { userId: { in: [ownerId, memberId] } },
    });
    await prisma.matchingResult.deleteMany({
      where: {
        firstUserId: { in: [ownerId, memberId] },
        secondUserId: { in: [ownerId, memberId] },
        topic: "WORRIES",
      },
    });
    await prisma.friendship.createMany({
      data: [
        { userId: ownerId, friendId: memberId },
        { userId: memberId, friendId: ownerId },
      ],
      skipDuplicates: true,
    });
  }
});

test("グループを100件以上読み込み古い会話も両方の一覧から開ける", async ({
  page,
}) => {
  const ids = Array.from(
    { length: 102 },
    (_, i) => `pagination-${runId}-${String(i).padStart(3, "0")}`,
  );
  const timestamp = new Date(Date.now() - 86400000);
  const oldestName = `oldest-group-${runId}`;
  try {
    await prisma.groupConversation.createMany({
      data: ids.map((id, i) => ({
        id,
        createdById: ownerId,
        name: i === 0 ? oldestName : `page-group-${i}`,
        updatedAt: timestamp,
      })),
    });
    await prisma.groupConversationMember.createMany({
      data: ids.map((groupId) => ({
        groupId,
        userId: ownerId,
        role: "OWNER" as const,
      })),
    });
    await login(page);
    const client = apiClient(page);
    const first = await client.group.list.query();
    const second = await client.group.list.query({ cursor: first.nextCursor });
    expect(first.groups).toHaveLength(100);
    expect(second.groups.some((group) => group.id === ids[0])).toBe(true);
    expect(
      new Set([...first.groups, ...second.groups].map((group) => group.id))
        .size,
    ).toBe(first.groups.length + second.groups.length);
    await expect(
      client.group.list.query({ cursor: "invalid" }),
    ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
    await page.goto("/");
    await page
      .getByRole("button", { name: "グループをさらに表示", exact: true })
      .click();
    await page.getByRole("button").filter({ hasText: oldestName }).click();
    const dialog = page.getByRole("dialog", {
      name: "グループDM",
      exact: true,
    });
    await expect(
      dialog.getByRole("heading", { name: oldestName, exact: true }),
    ).toBeVisible();
    // A fresh page starts with only the first page cached.
    await page.reload();
    await page
      .getByRole("button", { name: "グループDMを開く", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "グループをさらに表示", exact: true })
      .click();
    await page.setViewportSize({ width: 375, height: 812 });
    await dialog
      .getByRole("button", { name: "グループ一覧", exact: true })
      .click();
    await dialog.getByRole("button").filter({ hasText: oldestName }).click();
    await expect(
      dialog.getByRole("heading", { name: oldestName, exact: true }),
    ).toBeVisible();
    await expect(dialog.getByPlaceholder("グループへメッセージ")).toBeEnabled();
  } finally {
    await prisma.groupConversation.deleteMany({ where: { id: { in: ids } } });
  }
});

test("会話を切り替えると返信先を解除し遅れた失敗でも別の会話へ戻さない", async ({
  page,
}) => {
  const target = await prisma.serverChannel.create({
    data: { serverId, name: `reply-switch-${runId}` },
  });
  const content = `reply-source-${runId}`;
  const message = await prisma.serverMessage.create({
    data: { serverId, channelId, senderId: memberId, content },
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  try {
    await login(page);
    const chooseReply = async () => {
      // Initial scroll-to-latest can close a menu opened during navigation.
      await expect(async () => {
        await page
          .locator("article")
          .filter({ hasText: content })
          .getByRole("button", { name: "メッセージ操作" })
          .click();
        await page
          .getByRole("menuitem", { name: "返信", exact: true })
          .click({ timeout: 1000 });
      }).toPass({ timeout: 5000 });
      await expect(
        page.getByRole("button", { name: "返信を解除" }),
      ).toBeVisible();
    };
    await chooseReply();
    await page.getByRole("button", { name: target.name, exact: true }).click();
    await expect(page.getByRole("button", { name: "返信を解除" })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "general", exact: true }).click();
    await chooseReply();
    await page.route(
      "**/api/trpc/**server.sendMessage**",
      async (route) => {
        started();
        await gate;
        await route.abort("failed");
      },
      { times: 1 },
    );
    const input = page.locator("textarea[data-chat-input]");
    await input.fill("失敗する返信");
    await input.press("Enter");
    await requested;
    await page.getByRole("button", { name: target.name, exact: true }).click();
    const failed = page.waitForEvent("requestfailed", {
      predicate: (request) => request.url().includes("server.sendMessage"),
    });
    release();
    await failed;
    await expect(page.getByRole("button", { name: "返信を解除" })).toHaveCount(
      0,
    );
    await input.fill(`safe-reply-switch-${runId}`);
    await input.press("Enter");
    await expect
      .poll(() =>
        prisma.serverMessage.count({
          where: {
            channelId: target.id,
            content: `safe-reply-switch-${runId}`,
            replyToId: null,
          },
        }),
      )
      .toBe(1);
  } finally {
    release();
    if (!page.isClosed())
      await page.unroute("**/api/trpc/**server.sendMessage**");
    await prisma.serverMessage.deleteMany({ where: { id: message.id } });
    await prisma.serverChannel.deleteMany({ where: { id: target.id } });
  }
});

test("ブラウザに購読が残っていてもサーバーで失効した通知を有効表示しない", async ({
  page,
}) => {
  const endpoint = `https://fcm.googleapis.com/fcm/send/test-${runId}`;
  await page.addInitScript(
    ({ endpoint }) => {
      const subscription = { endpoint, unsubscribe: async () => true };
      const registration = {
        pushManager: { getSubscription: async () => subscription },
      };
      Object.defineProperty(navigator.serviceWorker, "getRegistration", {
        value: async () => registration,
      });
    },
    { endpoint },
  );
  try {
    await login(page);
    const client = apiClient(page);
    await prisma.pushSubscription.create({
      data: {
        userId: ownerId,
        endpoint,
        auth: "a".repeat(22),
        p256dh: "b".repeat(87),
      },
    });
    expect(
      (await client.notification.getPushSubscription.query({ endpoint }))
        .subscribed,
    ).toBe(true);
    await page.getByRole("button", { name: "通知設定", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "通知設定", exact: true });
    await expect(
      dialog.getByRole("button", { name: "プッシュ通知を停止" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    // Password reset removes the server subscription while the browser keeps it.
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    expect(
      (await client.notification.getPushSubscription.query({ endpoint }))
        .subscribed,
    ).toBe(false);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "通知設定", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "プッシュ通知を有効化" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "プッシュ通知を停止" }),
    ).toHaveCount(0);
    await client.notification.subscribePush.mutate({
      endpoint,
      auth: Buffer.alloc(16).toString("base64url"),
      p256dh: Buffer.alloc(65).toString("base64url"),
    });
    expect(
      (await client.notification.getPushSubscription.query({ endpoint }))
        .subscribed,
    ).toBe(true);
  } finally {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }
});

test("プロフィールアイコンからブロックしてメッセージとマッチングを除外する", async ({
  page,
}) => {
  await prisma.matchingQueue.create({
    data: { topic: "CASUAL", userId: memberId },
  });
  await login(page);

  const memberAvatar = page
    .getByRole("button", { name: "E2E Memberのプロフィールを開く" })
    .last();
  await memberAvatar.click({ button: "right" });
  const blockButton = page.getByRole("menuitem", {
    name: "ブロック",
    exact: true,
  });
  await expect(blockButton).toBeVisible();
  await expect(blockButton).toBeFocused();
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
    await blockButton.press(key);
    await expect(blockButton).toBeFocused();
  }
  await blockButton.press("Escape");
  await expect(blockButton).toHaveCount(0);

  await memberAvatar.click({ button: "right" });
  await expect(blockButton).toBeFocused();
  page.once("dialog", (dialog) => void dialog.accept());
  await blockButton.click();

  await expect
    .poll(() =>
      prisma.userBlock.count({
        where: { blockedId: memberId, blockerId: ownerId },
      }),
    )
    .toBe(1);
  await expect
    .poll(() =>
      prisma.friendship.count({
        where: {
          OR: [
            { friendId: memberId, userId: ownerId },
            { friendId: ownerId, userId: memberId },
          ],
        },
      }),
    )
    .toBe(0);
  await expect(
    page.getByText(`new-message-${runId}`, { exact: true }),
  ).toHaveCount(0, { timeout: 10_000 });

  await page.getByRole("link", { name: "connect" }).click();
  await page.getByRole("button", { name: "マッチング", exact: true }).click();
  const matchingForm = page.locator("form").filter({
    has: page.getByLabel("話したいこと"),
  });
  await matchingForm
    .getByRole("checkbox", {
      name: "内容を確認し、会話を始めることに同意します",
    })
    .check();
  await matchingForm
    .getByRole("button", { name: "マッチング", exact: true })
    .click();
  await expect(page.getByText("同じ話題の相手を探しています...")).toBeVisible();
  await expect
    .poll(async () => {
      const queue = await prisma.matchingQueue.findUnique({
        where: { userId: ownerId },
      });
      return queue ? (queue.matchedUserId ?? "waiting") : "missing";
    })
    .toBe("waiting");
  await expect(
    prisma.friendship.count({
      where: { friendId: memberId, userId: ownerId },
    }),
  ).resolves.toBe(0);
});
