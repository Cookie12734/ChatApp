import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  assertNotBlocked,
  getBlockedPeerIds,
  getVisibleFriendNotificationWhere,
} from "~/features/friend/server/blocking";
import {
  canCancelFriendRequest,
  getFriendRequestLockIds,
  getPendingFriendRequestWhere,
} from "~/features/friend/server/friend-request-permissions";
import { enforceTRPCRateLimits } from "~/server/api/rate-limit";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { addProfileImageUrl } from "~/lib/static-image";

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
    const blocks = await ctx.db.userBlock.findMany({
      where: {
        OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        blocked: {
          select: { id: true, userId: true, name: true },
        },
      },
    });
    const blockedPeerIds = getBlockedPeerIds(currentUserId, blocks);
    const notificationWhere = getVisibleFriendNotificationWhere(
      currentUserId,
      blockedPeerIds,
    );

    const [
      currentUser,
      friends,
      incomingRequests,
      outgoingRequests,
      notifications,
      unreadNotificationCount,
    ] = await Promise.all([
      ctx.db.user.findUniqueOrThrow({
        where: { id: currentUserId },
        select: { id: true, userId: true, name: true },
      }),
      ctx.db.friendship.findMany({
        where: {
          userId: currentUserId,
          ...(blockedPeerIds.length > 0
            ? { friendId: { notIn: blockedPeerIds } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          friend: {
            select: { id: true, userId: true, name: true },
          },
        },
      }),
      ctx.db.friendRequest.findMany({
        where: {
          receiverId: currentUserId,
          status: "PENDING",
          ...(blockedPeerIds.length > 0
            ? { senderId: { notIn: blockedPeerIds } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          sender: {
            select: { id: true, userId: true, name: true },
          },
        },
      }),
      ctx.db.friendRequest.findMany({
        where: {
          senderId: currentUserId,
          status: "PENDING",
          ...(blockedPeerIds.length > 0
            ? { receiverId: { notIn: blockedPeerIds } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          receiver: {
            select: { id: true, userId: true, name: true },
          },
        },
      }),
      ctx.db.notification.findMany({
        where: notificationWhere,
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      ctx.db.notification.count({
        where: { ...notificationWhere, readAt: null },
      }),
    ]);

    return {
      currentUser: addProfileImageUrl(currentUser),
      friends: friends.map((friendship) => ({
        ...friendship,
        friend: addProfileImageUrl(friendship.friend),
      })),
      incomingRequests: incomingRequests.map((request) => ({
        ...request,
        sender: addProfileImageUrl(request.sender),
      })),
      outgoingRequests: outgoingRequests.map((request) => ({
        ...request,
        receiver: addProfileImageUrl(request.receiver),
      })),
      notifications,
      blockedUsers: blocks
        .filter((block) => block.blockerId === currentUserId)
        .map((block) => ({
          ...block,
          blocked: addProfileImageUrl(block.blocked),
        })),
      unreadNotificationCount,
    };
  }),

  sendRequest: protectedProcedure
    .input(z.object({ userId: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const receiverUserId = input.userId.trim();

      await enforceTRPCRateLimits([
        {
          limit: 10,
          scope: "friend:request:user",
          subject: currentUserId,
          windowMs: 60 * 60 * 1000,
        },
      ]);

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
      const [firstUserId, secondUserId] = getFriendRequestLockIds(
        currentUserId,
        receiver.id,
      );

      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "User"
          WHERE "id" IN (${firstUserId}, ${secondUserId})
          ORDER BY "id"
          FOR UPDATE
        `;
        await assertNotBlocked(tx, currentUserId, receiver.id);

        const [existingFriendship, reversePendingRequest, sender] =
          await Promise.all([
            tx.friendship.findUnique({
              where: {
                userId_friendId: {
                  userId: currentUserId,
                  friendId: receiver.id,
                },
              },
              select: { id: true },
            }),
            tx.friendRequest.findUnique({
              where: {
                senderId_receiverId: {
                  senderId: receiver.id,
                  receiverId: currentUserId,
                },
              },
              select: { status: true },
            }),
            tx.user.findUniqueOrThrow({
              where: { id: currentUserId },
              select: { userId: true, name: true },
            }),
          ]);

        if (existingFriendship) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "このユーザーはすでにフレンドです",
          });
        }

        if (reversePendingRequest?.status === "PENDING") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "このユーザーからのフレンド申請が届いています",
          });
        }

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
      const [firstUserId, secondUserId] = getFriendRequestLockIds(
        request.senderId,
        request.receiverId,
      );

      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "User"
          WHERE "id" IN (${firstUserId}, ${secondUserId})
          ORDER BY "id"
          FOR UPDATE
        `;
        await assertNotBlocked(tx, request.senderId, request.receiverId);

        const transition = await tx.friendRequest.updateMany({
          where: getPendingFriendRequestWhere(request.id, currentUserId),
          data: { status: "ACCEPTED" },
        });

        if (transition.count !== 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "このフレンド申請は処理済みです",
          });
        }

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

        return tx.friendRequest.findUniqueOrThrow({
          where: { id: request.id },
        });
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
        const transition = await tx.friendRequest.updateMany({
          where: getPendingFriendRequestWhere(request.id, currentUserId),
          data: { status: "DECLINED" },
        });

        if (transition.count !== 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "このフレンド申請は処理済みです",
          });
        }

        await tx.notification.updateMany({
          where: {
            userId: currentUserId,
            friendRequestId: request.id,
            readAt: null,
          },
          data: { readAt: new Date() },
        });

        return tx.friendRequest.findUniqueOrThrow({
          where: { id: request.id },
        });
      });
    }),

  cancelRequest: protectedProcedure
    .input(z.object({ requestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const request = await ctx.db.friendRequest.findUnique({
        where: { id: input.requestId },
        select: { senderId: true, status: true },
      });

      if (!canCancelFriendRequest(currentUserId, request)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "取り消せるフレンド申請が見つかりません",
        });
      }

      const result = await ctx.db.friendRequest.deleteMany({
        where: {
          id: input.requestId,
          senderId: currentUserId,
          status: "PENDING",
        },
      });

      if (result.count !== 1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "取り消せるフレンド申請が見つかりません",
        });
      }

      return { requestId: input.requestId };
    }),

  removeFriend: protectedProcedure
    .input(z.object({ userId: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const friend = await ctx.db.user.findUnique({
        where: { userId: input.userId },
        select: { id: true },
      });

      if (!friend) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "フレンドが見つかりません",
        });
      }

      const result = await ctx.db.friendship.deleteMany({
        where: {
          OR: [
            { userId: currentUserId, friendId: friend.id },
            { userId: friend.id, friendId: currentUserId },
          ],
        },
      });

      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "フレンドが見つかりません",
        });
      }

      return { userId: input.userId };
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
      const [firstUserId, secondUserId] = getFriendRequestLockIds(
        currentUserId,
        blocked.id,
      );

      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "User"
          WHERE "id" IN (${firstUserId}, ${secondUserId})
          ORDER BY "id"
          FOR UPDATE
        `;

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

        await tx.matchingQueue.deleteMany({
          where: {
            OR: [
              { userId: currentUserId },
              { userId: blocked.id, matchedUserId: currentUserId },
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
