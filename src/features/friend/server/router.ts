import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { assertNotBlocked } from "~/features/friend/server/blocking";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const userIdSchema = z
  .string()
  .trim()
  .min(3, "ユーザーIDは3文字以上で入力してください")
  .max(32, "ユーザーIDは32文字以内で入力してください")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "ユーザーIDは半角英数字とアンダースコアのみ使用できます",
  );

export const friendRouter = createTRPCRouter({
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    const currentUserId = ctx.session.user.id;

    const [
      currentUser,
      friends,
      incomingRequests,
      outgoingRequests,
      notifications,
      blockedUsers,
    ] = await Promise.all([
      ctx.db.user.findUniqueOrThrow({
        where: { id: currentUserId },
        select: { id: true, userId: true, name: true, image: true },
      }),
      ctx.db.friendship.findMany({
        where: { userId: currentUserId },
        orderBy: { createdAt: "desc" },
        include: {
          friend: {
            select: { id: true, userId: true, name: true, image: true },
          },
        },
      }),
      ctx.db.friendRequest.findMany({
        where: { receiverId: currentUserId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        include: {
          sender: {
            select: { id: true, userId: true, name: true, image: true },
          },
        },
      }),
      ctx.db.friendRequest.findMany({
        where: { senderId: currentUserId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        include: {
          receiver: {
            select: { id: true, userId: true, name: true, image: true },
          },
        },
      }),
      ctx.db.notification.findMany({
        where: { userId: currentUserId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      ctx.db.userBlock.findMany({
        where: { blockerId: currentUserId },
        orderBy: { createdAt: "desc" },
        include: {
          blocked: {
            select: { id: true, userId: true, name: true, image: true },
          },
        },
      }),
    ]);

    return {
      currentUser,
      friends,
      incomingRequests,
      outgoingRequests,
      notifications,
      blockedUsers,
      unreadNotificationCount: notifications.filter(
        (notification) => !notification.readAt,
      ).length,
    };
  }),

  sendRequest: protectedProcedure
    .input(z.object({ userId: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const receiverUserId = input.userId.trim();

      const receiver = await ctx.db.user.findUnique({
        where: { userId: receiverUserId },
        select: { id: true, userId: true, name: true },
      });

      if (!receiver) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "そのユーザーIDのユーザーは見つかりません",
        });
      }

      if (receiver.id === currentUserId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "自分自身にフレンド申請はできません",
        });
      }
      await assertNotBlocked(ctx.db, currentUserId, receiver.id);

      const existingFriendship = await ctx.db.friendship.findUnique({
        where: {
          userId_friendId: {
            userId: currentUserId,
            friendId: receiver.id,
          },
        },
      });

      if (existingFriendship) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "このユーザーはすでにフレンドです",
        });
      }

      const reversePendingRequest = await ctx.db.friendRequest.findUnique({
        where: {
          senderId_receiverId: {
            senderId: receiver.id,
            receiverId: currentUserId,
          },
        },
      });

      if (reversePendingRequest?.status === "PENDING") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "このユーザーからのフレンド申請が届いています",
        });
      }

      const sender = await ctx.db.user.findUniqueOrThrow({
        where: { id: currentUserId },
        select: { userId: true, name: true },
      });

      return ctx.db.$transaction(async (tx) => {
        const request = await tx.friendRequest.upsert({
          where: {
            senderId_receiverId: {
              senderId: currentUserId,
              receiverId: receiver.id,
            },
          },
          update: { status: "PENDING" },
          create: {
            senderId: currentUserId,
            receiverId: receiver.id,
          },
        });

        await tx.notification.create({
          data: {
            userId: receiver.id,
            type: "FRIEND_REQUEST",
            message: `${sender.name ?? sender.userId}さんからフレンド申請が届きました`,
            friendRequestId: request.id,
          },
        });

        return request;
      });
    }),

  acceptRequest: protectedProcedure
    .input(z.object({ requestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      const request = await ctx.db.friendRequest.findUnique({
        where: { id: input.requestId },
        include: {
          receiver: { select: { userId: true, name: true } },
        },
      });

      if (request?.receiverId !== currentUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "フレンド申請が見つかりません",
        });
      }

      if (request.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "このフレンド申請は処理済みです",
        });
      }
      await assertNotBlocked(ctx.db, request.senderId, request.receiverId);

      return ctx.db.$transaction(async (tx) => {
        const acceptedRequest = await tx.friendRequest.update({
          where: { id: request.id },
          data: { status: "ACCEPTED" },
        });

        await tx.friendship.createMany({
          data: [
            { userId: request.senderId, friendId: request.receiverId },
            { userId: request.receiverId, friendId: request.senderId },
          ],
          skipDuplicates: true,
        });

        await tx.notification.create({
          data: {
            userId: request.senderId,
            type: "FRIEND_REQUEST_ACCEPTED",
            message: `${request.receiver.name ?? request.receiver.userId}さんがフレンド申請を承認しました`,
            friendRequestId: request.id,
          },
        });

        await tx.notification.updateMany({
          where: {
            userId: currentUserId,
            friendRequestId: request.id,
            readAt: null,
          },
          data: { readAt: new Date() },
        });

        return acceptedRequest;
      });
    }),

  declineRequest: protectedProcedure
    .input(z.object({ requestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      const request = await ctx.db.friendRequest.findUnique({
        where: { id: input.requestId },
      });

      if (request?.receiverId !== currentUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "フレンド申請が見つかりません",
        });
      }

      if (request.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "このフレンド申請は処理済みです",
        });
      }

      return ctx.db.$transaction(async (tx) => {
        const declinedRequest = await tx.friendRequest.update({
          where: { id: request.id },
          data: { status: "DECLINED" },
        });

        await tx.notification.updateMany({
          where: {
            userId: currentUserId,
            friendRequestId: request.id,
            readAt: null,
          },
          data: { readAt: new Date() },
        });

        return declinedRequest;
      });
    }),

  markNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await ctx.db.notification.updateMany({
      where: { userId: ctx.session.user.id, readAt: null },
      data: { readAt: new Date() },
    });

    return { count: result.count };
  }),

  blockUser: protectedProcedure
    .input(z.object({ userId: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const blocked = await ctx.db.user.findUnique({
        where: { userId: input.userId },
        select: { id: true },
      });

      if (!blocked) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ユーザーが見つかりません",
        });
      }

      if (blocked.id === currentUserId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "自分自身はブロックできません",
        });
      }

      return ctx.db.$transaction(async (tx) => {
        const block = await tx.userBlock.upsert({
          where: {
            blockerId_blockedId: {
              blockerId: currentUserId,
              blockedId: blocked.id,
            },
          },
          update: {},
          create: {
            blockerId: currentUserId,
            blockedId: blocked.id,
          },
        });

        await tx.friendship.deleteMany({
          where: {
            OR: [
              { userId: currentUserId, friendId: blocked.id },
              { userId: blocked.id, friendId: currentUserId },
            ],
          },
        });

        await tx.friendRequest.deleteMany({
          where: {
            OR: [
              { senderId: currentUserId, receiverId: blocked.id },
              { senderId: blocked.id, receiverId: currentUserId },
            ],
          },
        });

        return block;
      });
    }),

  unblockUser: protectedProcedure
    .input(z.object({ userId: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const blocked = await ctx.db.user.findUnique({
        where: { userId: input.userId },
        select: { id: true },
      });

      if (!blocked) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ユーザーが見つかりません",
        });
      }

      await ctx.db.userBlock.deleteMany({
        where: {
          blockerId: ctx.session.user.id,
          blockedId: blocked.id,
        },
      });

      return { userId: input.userId };
    }),
});
