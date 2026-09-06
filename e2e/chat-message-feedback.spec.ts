import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { createTRPCClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../src/server/api/root";
import { createRateLimitKey } from "../src/server/rate-limit-policy";

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
  await page.route("**/api/trpc/server.sendMessage**", async (route) => {
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

  await page.route("**/api/trpc/server.markChannelRead**", async (route) => {
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
  await page.route("**/api/trpc/group.sendMessage**", async (route) => {
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
    if (kind === "direct") await page.goto("/");
    const input = page.locator("textarea[data-chat-input]");
    await expect(input).toBeEnabled();
    const procedure =
      kind === "direct" ? "chat.sendMessage" : "server.sendMessage";
    const requests: string[] = [];
    await page.route(`**/api/trpc/${procedure}**`, async (route) => {
      requests.push(route.request().postData() ?? "");
      if (requests.length === 1) {
        await route.fetch();
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });
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
    expect(requests[1]).toBe(requests[0]);
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
  expect(counts[0]! + counts[1]!).toBe(1);
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
    await page.route("**/api/trpc/group.sendMessage**", async (route) => {
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
    await page.unroute("**/api/trpc/group.sendMessage**");
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
    await page.route(`**/api/trpc/${kind}.sendMessage**`, async (route) => {
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

test("プロフィールアイコンからブロックしてメッセージとマッチングを除外する", async ({
  page,
}) => {
  await prisma.matchingQueue.create({
    data: { topic: "CASUAL", userId: memberId },
  });
  await login(page);

  const memberAvatar = page
    .getByRole("button", { name: "E2E Memberのプロフィールを開く" })
    .first();
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
