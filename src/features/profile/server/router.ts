import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { presenceStatuses } from "~/features/profile/presence";
import { canViewProfile } from "~/features/profile/server/profile-permissions";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const profileInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "名前を入力してください")
    .max(50, "名前は50文字以内で入力してください"),
  bio: z
    .string()
    .trim()
    .max(160, "自己紹介は160文字以内で入力してください")
    .optional(),
  statusMessage: z
    .string()
    .trim()
    .max(80, "ステータスは80文字以内で入力してください")
    .optional(),
  presenceStatus: z.enum(presenceStatuses).optional(),
});

const presenceInput = z.object({
  presenceStatus: z.enum(presenceStatuses),
});

const profileDetailInput = z.object({
  serverId: z.string().min(1).optional(),
  userId: z.string().trim().min(1).max(32),
});

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();

  if (trimmed === undefined || trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

export const profileRouter = createTRPCRouter({
  getMine: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        userId: true,
        name: true,
        image: true,
        bio: true,
        statusMessage: true,
        presenceStatus: true,
      },
    });
  }),

  getByUserId: protectedProcedure
    .input(profileDetailInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const profile = await ctx.db.user.findUnique({
        where: { userId: input.userId },
        select: {
          bio: true,
          id: true,
          image: true,
          name: true,
          presenceStatus: true,
          statusMessage: true,
          userId: true,
        },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "プロフィールが見つかりません",
        });
      }

      const isCurrentUser = profile.id === currentUserId;
      const [
        block,
        friendship,
        sharedServer,
        outgoingRequest,
        incomingRequest,
        contextMemberships,
      ] = await Promise.all([
        ctx.db.userBlock.findFirst({
          where: {
            OR: [
              { blockerId: currentUserId, blockedId: profile.id },
              { blockerId: profile.id, blockedId: currentUserId },
            ],
          },
          select: { id: true },
        }),
        ctx.db.friendship.findUnique({
          where: {
            userId_friendId: {
              userId: currentUserId,
              friendId: profile.id,
            },
          },
          select: { id: true },
        }),
        ctx.db.serverMember.findFirst({
          where: {
            userId: currentUserId,
            server: {
              members: {
                some: { userId: profile.id },
              },
            },
          },
          select: { id: true },
        }),
        ctx.db.friendRequest.findUnique({
          where: {
            senderId_receiverId: {
              senderId: currentUserId,
              receiverId: profile.id,
            },
          },
          select: { id: true, status: true },
        }),
        ctx.db.friendRequest.findUnique({
          where: {
            senderId_receiverId: {
              senderId: profile.id,
              receiverId: currentUserId,
            },
          },
          select: { id: true, status: true },
        }),
        input.serverId
          ? ctx.db.serverMember.findMany({
              where: {
                serverId: input.serverId,
                userId: { in: [currentUserId, profile.id] },
              },
              select: {
                bio: true,
                nickname: true,
                serverId: true,
                userId: true,
              },
            })
          : Promise.resolve([]),
      ]);

      if (
        !isCurrentUser &&
        !canViewProfile({
          isBlocked: Boolean(block),
          isFriend: Boolean(friendship),
          sharesServer: Boolean(sharedServer),
        })
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "プロフィールが見つかりません",
        });
      }

      const viewerServerMembership = contextMemberships.find(
        (membership) => membership.userId === currentUserId,
      );
      const profileServerMembership = contextMemberships.find(
        (membership) => membership.userId === profile.id,
      );
      const serverProfile =
        viewerServerMembership && profileServerMembership
          ? {
              bio: profileServerMembership.bio,
              nickname: profileServerMembership.nickname,
              serverId: profileServerMembership.serverId,
            }
          : null;
      const relationship = isCurrentUser
        ? ("SELF" as const)
        : friendship
          ? ("FRIENDS" as const)
          : outgoingRequest?.status === "PENDING"
            ? ("OUTGOING_PENDING" as const)
            : incomingRequest?.status === "PENDING"
              ? ("INCOMING_PENDING" as const)
              : ("NONE" as const);

      return {
        ...profile,
        incomingRequestId:
          relationship === "INCOMING_PENDING" ? incomingRequest?.id : null,
        outgoingRequestId:
          relationship === "OUTGOING_PENDING" ? outgoingRequest?.id : null,
        relationship,
        serverProfile,
      };
    }),

  updateMine: protectedProcedure
    .input(profileInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: {
          name: input.name.trim(),
          bio: normalizeOptionalText(input.bio),
          statusMessage: normalizeOptionalText(input.statusMessage),
          ...(input.presenceStatus
            ? { presenceStatus: input.presenceStatus }
            : {}),
        },
        select: {
          id: true,
          userId: true,
          name: true,
          image: true,
          bio: true,
          statusMessage: true,
          presenceStatus: true,
        },
      });
    }),

  updatePresence: protectedProcedure
    .input(presenceInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { presenceStatus: input.presenceStatus },
        select: {
          id: true,
          presenceStatus: true,
        },
      });
    }),
});
