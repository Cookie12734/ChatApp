import { type PrismaClient } from "@prisma/client";
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
import { getExcludedDiscoveryUserIds } from "~/features/friend/server/user-discovery";
import { enforceTRPCRateLimits } from "~/server/api/rate-limit";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { addProfileImageUrl } from "~/lib/static-image";
import { userIdSchema } from "~/lib/input";
import { schedulePushNotification } from "~/features/notification/server/push";

const discoveryLimit = z.number().int().min(1).max(20);

const searchUsersInput = z.object({
  limit: discoveryLimit.optional(),
  query: z.string().trim().min(2).max(50),
});

const recommendedUsersInput = z
  .object({ limit: discoveryLimit.optional() })
  .optional();

async function getUserDiscoveryContext(
  database: PrismaClient,
  currentUserId: string,
) {
  const [blocks, friendships, pendingRequests, memberships] = await Promise.all(
    [
      database.userBlock.findMany({
        where: {
          OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
        },
        select: { blockedId: true, blockerId: true },
      }),
      database.friendship.findMany({
        where: {
          OR: [{ userId: currentUserId }, { friendId: currentUserId }],
        },
        select: { friendId: true, userId: true },
      }),
      database.friendRequest.findMany({
        where: {
          status: "PENDING",
          OR: [{ senderId: currentUserId }, { receiverId: currentUserId }],
        },
        select: { receiverId: true, senderId: true },
      }),
      database.serverMember.findMany({
        where: { userId: currentUserId },
        select: { serverId: true },
      }),
    ],
  );

  return {
    excludedUserIds: getExcludedDiscoveryUserIds({
      blockedPeerIds: getBlockedPeerIds(currentUserId, blocks),
      currentUserId,
      friendships,
      pendingRequests,
    }),
    sharedServerIds: memberships.map((membership) => membership.serverId),
  };
}

function addDiscoveryPreview(
  user: { name: string | null; userId: string },
  sharedServerCount: number,
) {
  return {
    ...addProfileImageUrl({ name: user.name, userId: user.userId }),
    sharedServerCount,
  };
}

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

  searchUsers: protectedProcedure
    .input(searchUsersInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const limit = input.limit ?? 20;
      const query = input.query.trim();

      await enforceTRPCRateLimits([
        {
          limit: 30,
          scope: "friend:search:user",
          subject: currentUserId,
          windowMs: 60 * 1000,
        },
      ]);

      const { excludedUserIds, sharedServerIds } =
        await getUserDiscoveryContext(ctx.db, currentUserId);
      const [exactUser, matchingUsers] = await Promise.all([
        ctx.db.user.findFirst({
          where: {
            id: { notIn: excludedUserIds },
            userId: { equals: query, mode: "insensitive" },
          },
          select: { id: true, name: true, userId: true },
        }),
        ctx.db.user.findMany({
          where: {
            id: { notIn: excludedUserIds },
            OR: [
              { userId: { contains: query, mode: "insensitive" } },
              { name: { contains: query, mode: "insensitive" } },
            ],
          },
          orderBy: { userId: "asc" },
          take: limit,
          select: { id: true, name: true, userId: true },
        }),
      ]);
      const uniqueUsers = new Map<
        string,
        { id: string; name: string | null; userId: string }
      >();
      if (exactUser) uniqueUsers.set(exactUser.id, exactUser);
      for (const user of matchingUsers) uniqueUsers.set(user.id, user);
      const users = [...uniqueUsers.values()].slice(0, limit);
      const sharedServerCounts =
        users.length > 0 && sharedServerIds.length > 0
          ? await ctx.db.serverMember.groupBy({
              by: ["userId"],
              where: {
                serverId: { in: sharedServerIds },
                userId: { in: users.map((user) => user.id) },
              },
              _count: { serverId: true },
            })
          : [];
      const countByUserId = new Map(
        sharedServerCounts.map((item) => [item.userId, item._count.serverId]),
      );

      return {
        users: users.map(({ id, ...user }) =>
          addDiscoveryPreview(user, countByUserId.get(id) ?? 0),
        ),
      };
    }),

  getRecommendedUsers: protectedProcedure
    .input(recommendedUsersInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const limit = input?.limit ?? 12;

      await enforceTRPCRateLimits([
        {
          limit: 30,
          scope: "friend:recommendations:user",
          subject: currentUserId,
          windowMs: 60 * 1000,
        },
      ]);

      const { excludedUserIds, sharedServerIds } =
        await getUserDiscoveryContext(ctx.db, currentUserId);
      if (sharedServerIds.length === 0) return { users: [] };

      const recommendations = await ctx.db.serverMember.groupBy({
        by: ["userId"],
        where: {
          serverId: { in: sharedServerIds },
          userId: { notIn: excludedUserIds },
        },
        _count: { serverId: true },
        orderBy: [{ _count: { serverId: "desc" } }, { userId: "asc" }],
        take: limit,
      });
      const users = await ctx.db.user.findMany({
        where: { id: { in: recommendations.map((item) => item.userId) } },
        select: { id: true, name: true, userId: true },
      });
      const userById = new Map(users.map((user) => [user.id, user]));

      return {
        users: recommendations.flatMap((recommendation) => {
          const user = userById.get(recommendation.userId);
          return user
            ? [addDiscoveryPreview(user, recommendation._count.serverId)]
            : [];
        }),
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

      const request = await ctx.db.$transaction(async (tx) => {
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
      schedulePushNotification(ctx.db, {
        kind: "FRIEND_REQUEST",
        recipientId: receiver.id,
        title: "フレンド申請",
        url: "/friends",
      });
      return request;
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

        const sharedGroups = await tx.groupConversation.findMany({
          where: {
            AND: [
              { members: { some: { userId: currentUserId } } },
              { members: { some: { userId: blocked.id } } },
            ],
          },
          select: { createdById: true, id: true },
        });
        const ownedSharedGroupIds = sharedGroups
          .filter(({ createdById }) => createdById === currentUserId)
          .map(({ id }) => id);
        const joinedSharedGroupIds = sharedGroups
          .filter(({ createdById }) => createdById !== currentUserId)
          .map(({ id }) => id);
        if (ownedSharedGroupIds.length > 0) {
          await tx.groupConversationMember.deleteMany({
            where: {
              groupId: { in: ownedSharedGroupIds },
              userId: blocked.id,
            },
          });
        }
        if (joinedSharedGroupIds.length > 0) {
          await tx.groupConversationMember.deleteMany({
            where: {
              groupId: { in: joinedSharedGroupIds },
              userId: currentUserId,
            },
          });
          await tx.groupConversation.deleteMany({
            where: {
              id: { in: joinedSharedGroupIds },
              members: { none: {} },
            },
          });
        }

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
