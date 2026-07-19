import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../generated/prisma/index.js";

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
const chatEventIds: bigint[] = [];

async function login(page: Page) {
  const callbackUrl = `/?serverId=${serverId}`;
  await page.goto(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await page.getByLabel("メールアドレス").fill(ownerEmail);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("textarea[data-chat-input]")).toBeEnabled({
    timeout: 15_000,
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await prisma.user.deleteMany({
    where: { email: { startsWith: "codex-e2e-" } },
  });
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
});

test.afterAll(async () => {
  if (chatEventIds.length > 0) {
    await prisma.chatEvent.deleteMany({ where: { id: { in: chatEventIds } } });
  }
  if (serverId) {
    await prisma.chatServer.deleteMany({ where: { id: serverId } });
  }
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

  const pendingMessage = page.locator("article").filter({ hasText: content });
  await expect(pendingMessage).toHaveCSS("color", "rgb(125, 135, 129)");
  await expect(pendingMessage).not.toContainText("送信中");
  await expect(pendingMessage).toHaveCSS("color", "rgb(24, 34, 31)", {
    timeout: 10_000,
  });
  await expect(
    page.locator("article").filter({ hasText: content }),
  ).toHaveCount(1);

  const followupContent = `optimistic-followup-${runId}`;
  await input.fill(followupContent);
  await input.press("Enter");

  const followupMessage = page
    .locator("article")
    .filter({ hasText: followupContent });
  await expect(followupMessage).toHaveCSS("color", "rgb(125, 135, 129)");
  await expect(followupMessage).not.toContainText("送信中");
  await expect(followupMessage.locator("time")).toHaveCount(0);
  await expect(
    followupMessage.getByRole("button", { name: /プロフィールを開く/ }),
  ).toHaveCount(0);
  await expect(
    followupMessage.getByText("E2E Owner", { exact: true }),
  ).toHaveCount(0);
  await expect(followupMessage).toHaveCSS("color", "rgb(24, 34, 31)", {
    timeout: 10_000,
  });
});

test("スクロール中の新着件数と未読線を表示する", async ({ page }) => {
  await login(page);
  const viewport = page.locator(".chat-scrollbar").first();
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
  await prisma.serverMessage.create({
    data: { channelId, content, senderId: memberId, serverId },
  });
  const event = await prisma.chatEvent.create({
    data: {
      audienceIds: [],
      kind: "server",
      payload: {
        change: "created",
        channelId,
        kind: "server",
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
  await memberAvatar.scrollIntoViewIfNeeded();
  const avatarBounds = await memberAvatar.boundingBox();
  if (!avatarBounds)
    throw new Error("プロフィールアイコンが表示されていません");
  await page.mouse.click(
    avatarBounds.x + avatarBounds.width / 2,
    avatarBounds.y + avatarBounds.height / 2,
    { button: "right" },
  );
  const blockButton = page.getByRole("menuitem", {
    name: "ブロック",
    exact: true,
  });
  await expect(blockButton).toBeVisible();
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
