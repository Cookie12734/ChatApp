import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  assertNotBlocked,
  getBlockedPeerIds,
} from "~/features/friend/server/blocking";
import { canManageDirectMessage } from "~/features/chat/server/direct-message-permissions";
import { canShowMatchedUser } from "~/features/chat/server/matching-permissions";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const friendIdInput = z.object({
  friendId: z.string().min(1),
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
    const blocks = await ctx.db.userBlock.findMany({
      where: {
        OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
      },
      select: { blockedId: true, blockerId: true },
    });
    const blockedPeerIds = getBlockedPeerIds(currentUserId, blocks);

    const friendships = await ctx.db.friendship.findMany({
      where: {
        userId: currentUserId,
        ...(blockedPeerIds.length > 0
          ? { friendId: { notIn: blockedPeerIds } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        friend: {
          select: { id: true, userId: true, name: true, image: true },
        },
      },
    });

    const friends = await Promise.all(
      friendships.map(async (friendship) => {
        const [lastMessage, unreadCount] = await Promise.all([
          ctx.db.directMessage.findFirst({
            where: {
              OR: [
                {
                  receiverId: currentUserId,
                  senderId: friendship.friendId,
                },
                {
                  receiverId: friendship.friendId,
                  senderId: currentUserId,
                },
              ],
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              createdAt: true,
              receiverId: true,
              senderId: true,
            },
          }),
          ctx.db.directMessage.count({
            where: {
              receiverId: currentUserId,
              senderId: friendship.friendId,
              readAt: null,
            },
          }),
        ]);

        return {
          currentUserId,
          friendshipId: friendship.id,
          friend: friendship.friend,
          lastMessage,
          unreadCount,
        };
      }),
    );

    return friends.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt.getTime() ?? 0;
      const bTime = b.lastMessage?.createdAt.getTime() ?? 0;
      return bTime - aTime;
    });
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
    .input(friendIdInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      const friendship = await ctx.db.friendship.findUnique({
        where: {
          userId_friendId: {
            userId: currentUserId,
            friendId: input.friendId,
          },
        },
        include: {
          friend: {
            select: { id: true, userId: true, name: true, image: true },
          },
        },
      });

      if (!friendship) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "フレンドとのチャットだけ開けます",
        });
      }
      await assertNotBlocked(ctx.db, currentUserId, input.friendId);

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
          orderBy: { createdAt: "asc" },
          take: 100,
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

      await ctx.db.directMessage.updateMany({
        where: {
          receiverId: currentUserId,
          senderId: input.friendId,
          readAt: null,
        },
        data: { readAt: new Date() },
      });

      return {
        currentUser,
        currentUserId,
        friend: friendship.friend,
        messages,
      };
    }),

  sendMessage: protectedProcedure
    .input(sendMessageInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

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

      return ctx.db.directMessage.create({
        data: {
          content: input.content.trim(),
          receiverId: input.friendId,
          senderId: currentUserId,
        },
      });
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

      const [block, friendship] = await Promise.all([
        ctx.db.userBlock.findFirst({
          where: {
            OR: [
              { blockerId: currentUserId, blockedId: message.receiverId },
              { blockerId: message.receiverId, blockedId: currentUserId },
            ],
          },
          select: { id: true },
        }),
        ctx.db.friendship.findUnique({
          where: {
            userId_friendId: {
              userId: currentUserId,
              friendId: message.receiverId,
            },
          },
          select: { id: true },
        }),
      ]);

      if (
        !canManageDirectMessage({
          currentUserId,
          isBlocked: Boolean(block),
          isFriend: Boolean(friendship),
          senderId: message.senderId,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot edit this message",
        });
      }

      return ctx.db.directMessage.update({
        where: { id: message.id },
        data: { content: input.content },
        select: { id: true, content: true },
      });
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

      const [block, friendship] = await Promise.all([
        ctx.db.userBlock.findFirst({
          where: {
            OR: [
              { blockerId: currentUserId, blockedId: message.receiverId },
              { blockerId: message.receiverId, blockedId: currentUserId },
            ],
          },
          select: { id: true },
        }),
        ctx.db.friendship.findUnique({
          where: {
            userId_friendId: {
              userId: currentUserId,
              friendId: message.receiverId,
            },
          },
          select: { id: true },
        }),
      ]);

      if (
        !canManageDirectMessage({
          currentUserId,
          isBlocked: Boolean(block),
          isFriend: Boolean(friendship),
          senderId: message.senderId,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete this message",
        });
      }

      await ctx.db.directMessage.delete({ where: { id: message.id } });
      return { id: message.id };
    }),
});
