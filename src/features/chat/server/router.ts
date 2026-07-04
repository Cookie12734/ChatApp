import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  assertNotBlocked,
  getBlockedPeerIds,
} from "~/features/friend/server/blocking";
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

  deleteMessage: protectedProcedure
    .input(messageIdInput)
    .mutation(async ({ ctx, input }) => {
      const message = await ctx.db.directMessage.findUnique({
        where: { id: input.messageId },
        select: { id: true, senderId: true },
      });

      if (message?.senderId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "削除できるメッセージが見つかりません",
        });
      }

      await ctx.db.directMessage.delete({ where: { id: message.id } });
      return { id: message.id };
    }),
});
