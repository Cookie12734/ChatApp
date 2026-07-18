import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  assertNotBlocked,
  getBlockedPeerIds,
} from "~/features/friend/server/blocking";
import { canManageDirectMessage } from "~/features/chat/server/direct-message-permissions";
import { canShowMatchedUser } from "~/features/chat/server/matching-permissions";
import {
  MESSAGE_PAGE_SIZE,
  prepareMessagePage,
} from "~/features/chat/message-page";
import {
  getLatestFriendMessage,
  sortFriendsByLatestMessage,
} from "~/features/chat/friend-overview";
import { enforceTRPCRateLimits } from "~/server/api/rate-limit";
import { publishChatEvent } from "~/server/chat-events";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const friendIdInput = z.object({
  friendId: z.string().min(1),
});

const conversationInput = friendIdInput.extend({
  cursor: z.string().nullish(),
});

const markConversationReadInput = friendIdInput.extend({
  messageId: z.string().min(1),
});

const messageIdInput = z.object({
  messageId: z.string().min(1),
});

const sendMessageInput = friendIdInput.extend({
  content: z
    .string()
    .trim()
    .min(1, "メッセージを入力してください")
    .max(1000, "メッセージは1000文字以内で入力してください"),
});

const updateMessageInput = messageIdInput.extend({
  content: sendMessageInput.shape.content,
});

const typingInput = friendIdInput.extend({
  isTyping: z.boolean(),
});

const matchingTopicInput = z.object({
  topic: z.enum(["CASUAL", "GAME", "WORRIES"]),
});

const userPreviewSelect = {
  id: true,
  image: true,
  name: true,
  userId: true,
} as const;

export const chatRouter = createTRPCRouter({
  getFriends: protectedProcedure.query(async ({ ctx }) => {
    const currentUserId = ctx.session.user.id;
    const [blocks, friendships, sentPeers, receivedPeers] = await Promise.all([
      ctx.db.userBlock.findMany({
        where: {
          OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
        },
        select: { blockedId: true, blockerId: true },
      }),
      ctx.db.friendship.findMany({
        where: { userId: currentUserId },
        orderBy: { createdAt: "desc" },
        select: { friendId: true, id: true },
      }),
      ctx.db.directMessage.groupBy({
        by: ["receiverId"],
        where: { senderId: currentUserId },
      }),
      ctx.db.directMessage.groupBy({
        by: ["senderId"],
        where: { receiverId: currentUserId },
      }),
    ]);
    const blockedPeerIds = getBlockedPeerIds(currentUserId, blocks);
    const blockedPeerIdSet = new Set(blockedPeerIds);
    const friendshipByFriendId = new Map(
      friendships.map((friendship) => [friendship.friendId, friendship.id]),
    );
    const contactIds = new Set([
      ...friendshipByFriendId.keys(),
      ...sentPeers.map((message) => message.receiverId),
      ...receivedPeers.map((message) => message.senderId),
    ]);
    const contacts = await ctx.db.user.findMany({
      where: { id: { in: [...contactIds] } },
      select: {
        id: true,
        userId: true,
        name: true,
        image: true,
        sentDirectMessages: {
          where: { receiverId: currentUserId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            receiverId: true,
            senderId: true,
          },
        },
        receivedDirectMessages: {
          where: { senderId: currentUserId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            receiverId: true,
            senderId: true,
          },
        },
        _count: {
          select: {
            sentDirectMessages: {
              where: { receiverId: currentUserId, readAt: null },
            },
          },
        },
      },
    });

    const friends = contacts.map((contact) => {
      const { _count, receivedDirectMessages, sentDirectMessages, ...friend } =
        contact;
      const friendshipId = friendshipByFriendId.get(friend.id) ?? null;

      return {
        currentUserId,
        friendshipId,
        friend,
        isBlocked: blockedPeerIdSet.has(friend.id),
        isFriend: friendshipId !== null,
        lastMessage: getLatestFriendMessage(
          sentDirectMessages[0],
          receivedDirectMessages[0],
        ),
        unreadCount: _count.sentDirectMessages,
      };
    });

    return sortFriendsByLatestMessage(friends);
  }),

  getMatchingStatus: protectedProcedure.query(async ({ ctx }) => {
    const currentUserId = ctx.session.user.id;
    const queue = await ctx.db.matchingQueue.findUnique({
      where: { userId: currentUserId },
      select: { matchedUserId: true, topic: true },
    });

    if (!queue) {
      return { status: "idle" as const };
    }

    if (!queue.matchedUserId) {
      return { status: "waiting" as const, topic: queue.topic };
    }

    const [block, friendship, friend] = await Promise.all([
      ctx.db.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: currentUserId, blockedId: queue.matchedUserId },
            { blockerId: queue.matchedUserId, blockedId: currentUserId },
          ],
        },
        select: { id: true },
      }),
      ctx.db.friendship.findUnique({
        where: {
          userId_friendId: {
            userId: currentUserId,
            friendId: queue.matchedUserId,
          },
        },
        select: { id: true },
      }),
      ctx.db.user.findUnique({
        where: { id: queue.matchedUserId },
        select: userPreviewSelect,
      }),
    ]);

    return friend &&
      canShowMatchedUser({
        isBlocked: Boolean(block),
        isFriend: Boolean(friendship),
      })
      ? { friend, status: "matched" as const, topic: queue.topic }
      : { status: "idle" as const };
  }),

  matchRandom: protectedProcedure
    .input(matchingTopicInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      await enforceTRPCRateLimits([
        {
          limit: 10,
          scope: "chat:matching:user",
          subject: currentUserId,
          windowMs: 60 * 1000,
        },
      ]);

      const [blocks, friendships] = await Promise.all([
        ctx.db.userBlock.findMany({
          where: {
            OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
          },
          select: { blockedId: true, blockerId: true },
        }),
        ctx.db.friendship.findMany({
          where: { userId: currentUserId },
          select: { friendId: true },
        }),
      ]);
      const excludedUserIds = [
        currentUserId,
        ...getBlockedPeerIds(currentUserId, blocks),
        ...friendships.map((friendship) => friendship.friendId),
      ];

      return ctx.db.$transaction(async (tx) => {
        const wait = async () => {
          await tx.matchingQueue.upsert({
            where: { userId: currentUserId },
            update: { matchedUserId: null, topic: input.topic },
            create: { topic: input.topic, userId: currentUserId },
          });

          return { status: "waiting" as const, topic: input.topic };
        };

        await tx.matchingQueue.deleteMany({
          where: { userId: currentUserId },
        });

        const waitingUsers = await tx.matchingQueue.findMany({
          where: {
            matchedUserId: null,
            topic: input.topic,
            userId: { notIn: excludedUserIds },
          },
          orderBy: { createdAt: "asc" },
          take: 50,
          include: { user: { select: userPreviewSelect } },
        });

        const match =
          waitingUsers[Math.floor(Math.random() * waitingUsers.length)];
        if (!match) {
          return wait();
        }

        // ponytail: random from the oldest 50 keeps this cheap; use DB random/locks if traffic grows.
        const claimed = await tx.matchingQueue.updateMany({
          where: { id: match.id, matchedUserId: null },
          data: { matchedUserId: currentUserId },
        });

        if (claimed.count === 0) {
          return wait();
        }

        await tx.friendship.createMany({
          data: [
            { friendId: match.userId, userId: currentUserId },
            { friendId: currentUserId, userId: match.userId },
          ],
          skipDuplicates: true,
        });

        return {
          friend: match.user,
          status: "matched" as const,
          topic: input.topic,
        };
      });
    }),

  cancelMatching: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.matchingQueue.deleteMany({
      where: { userId: ctx.session.user.id },
    });

    return { ok: true };
  }),

  getConversation: protectedProcedure
    .input(conversationInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      const [friendship, existingMessage, block, friend] = await Promise.all([
        ctx.db.friendship.findUnique({
          where: {
            userId_friendId: {
              userId: currentUserId,
              friendId: input.friendId,
            },
          },
          select: { id: true },
        }),
        ctx.db.directMessage.findFirst({
          where: {
            OR: [
              { receiverId: currentUserId, senderId: input.friendId },
              { receiverId: input.friendId, senderId: currentUserId },
            ],
          },
          select: { id: true },
        }),
        ctx.db.userBlock.findFirst({
          where: {
            OR: [
              { blockerId: currentUserId, blockedId: input.friendId },
              { blockerId: input.friendId, blockedId: currentUserId },
            ],
          },
          select: { id: true },
        }),
        ctx.db.user.findUnique({
          where: { id: input.friendId },
          select: { id: true, userId: true, name: true, image: true },
        }),
      ]);

      if (!friend || (!friendship && !existingMessage)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この会話は開けません",
        });
      }

      const [currentUser, messages] = await Promise.all([
        ctx.db.user.findUniqueOrThrow({
          where: { id: currentUserId },
          select: { id: true, userId: true, name: true, image: true },
        }),
        ctx.db.directMessage.findMany({
          where: {
            OR: [
              {
                receiverId: currentUserId,
                senderId: input.friendId,
              },
              {
                receiverId: input.friendId,
                senderId: currentUserId,
              },
            ],
          },
          cursor: input.cursor ? { id: input.cursor } : undefined,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: MESSAGE_PAGE_SIZE + 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            readAt: true,
            receiverId: true,
            senderId: true,
          },
        }),
      ]);

      return {
        currentUser,
        currentUserId,
        canSend: Boolean(friendship) && !block,
        friend,
        ...prepareMessagePage(messages),
      };
    }),

  markConversationRead: protectedProcedure
    .input(markConversationReadInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const message = await ctx.db.directMessage.findFirst({
        where: {
          id: input.messageId,
          OR: [
            { receiverId: currentUserId, senderId: input.friendId },
            { receiverId: input.friendId, senderId: currentUserId },
          ],
        },
        select: { createdAt: true },
      });

      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "会話が見つかりません",
        });
      }

      const result = await ctx.db.directMessage.updateMany({
        where: {
          receiverId: currentUserId,
          senderId: input.friendId,
          readAt: null,
          createdAt: { lte: message.createdAt },
        },
        data: { readAt: new Date() },
      });

      return { count: result.count, readThrough: message.createdAt };
    }),

  setTyping: protectedProcedure
    .input(typingInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceTRPCRateLimits([
        {
          limit: 30,
          scope: "chat:typing:user",
          subject: currentUserId,
          windowMs: 10 * 1000,
        },
      ]);
      const [friendship, currentUser] = await Promise.all([
        ctx.db.friendship.findUnique({
          where: {
            userId_friendId: {
              userId: currentUserId,
              friendId: input.friendId,
            },
          },
          select: { id: true },
        }),
        ctx.db.user.findUniqueOrThrow({
          where: { id: currentUserId },
          select: { name: true, userId: true },
        }),
      ]);

      if (!friendship) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "フレンドにだけ入力状態を送れます",
        });
      }
      await assertNotBlocked(ctx.db, currentUserId, input.friendId);
      const userName = currentUser.name?.trim() ?? currentUser.userId;

      void publishChatEvent(ctx.db, {
        isTyping: input.isTyping,
        kind: "typing",
        senderId: currentUserId,
        userIds: [currentUserId, input.friendId],
        userName,
      });

      return { ok: true };
    }),

  sendMessage: protectedProcedure
    .input(sendMessageInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      await enforceTRPCRateLimits([
        {
          limit: 30,
          scope: "chat:message:user",
          subject: currentUserId,
          windowMs: 10 * 1000,
        },
      ]);

      const friendship = await ctx.db.friendship.findUnique({
        where: {
          userId_friendId: {
            userId: currentUserId,
            friendId: input.friendId,
          },
        },
        select: { id: true },
      });

      if (!friendship) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "フレンドにだけメッセージを送れます",
        });
      }
      await assertNotBlocked(ctx.db, currentUserId, input.friendId);

      const message = await ctx.db.directMessage.create({
        data: {
          content: input.content.trim(),
          receiverId: input.friendId,
          senderId: currentUserId,
        },
      });

      void publishChatEvent(ctx.db, {
        kind: "direct",
        userIds: [currentUserId, input.friendId],
      });
      return message;
    }),

  updateMessage: protectedProcedure
    .input(updateMessageInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const message = await ctx.db.directMessage.findUnique({
        where: { id: input.messageId },
        select: { id: true, receiverId: true, senderId: true },
      });

      if (message?.senderId !== currentUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "編集できるメッセージが見つかりません",
        });
      }

      if (
        !canManageDirectMessage({
          currentUserId,
          senderId: message.senderId,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot edit this message",
        });
      }

      const updatedMessage = await ctx.db.directMessage.update({
        where: { id: message.id },
        data: { content: input.content },
        select: { id: true, content: true },
      });

      void publishChatEvent(ctx.db, {
        kind: "direct",
        userIds: [currentUserId, message.receiverId],
      });
      return updatedMessage;
    }),

  deleteMessage: protectedProcedure
    .input(messageIdInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const message = await ctx.db.directMessage.findUnique({
        where: { id: input.messageId },
        select: { id: true, receiverId: true, senderId: true },
      });

      if (message?.senderId !== currentUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "削除できるメッセージが見つかりません",
        });
      }

      if (
        !canManageDirectMessage({
          currentUserId,
          senderId: message.senderId,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete this message",
        });
      }

      await ctx.db.directMessage.delete({ where: { id: message.id } });
      void publishChatEvent(ctx.db, {
        kind: "direct",
        userIds: [currentUserId, message.receiverId],
      });
      return { id: message.id };
    }),
});
