import { randomUUID } from "crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const serverInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "サーバー名を入力してください")
    .max(50, "サーバー名は50文字以内で入力してください"),
  description: z
    .string()
    .trim()
    .max(160, "説明は160文字以内で入力してください")
    .optional(),
});

export const serverRouter = createTRPCRouter({
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    const currentUserId = ctx.session.user.id;

    const [currentUser, memberships] = await Promise.all([
      ctx.db.user.findUniqueOrThrow({
        where: { id: currentUserId },
        select: { id: true, userId: true, name: true, image: true },
      }),
      ctx.db.serverMember.findMany({
        where: { userId: currentUserId },
        orderBy: { createdAt: "asc" },
        include: {
          server: {
            include: {
              members: {
                orderBy: { createdAt: "asc" },
                include: {
                  user: {
                    select: { id: true, userId: true, name: true, image: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      currentUser,
      memberships: memberships.map((membership) => ({
        ...membership,
        server: {
          ...membership.server,
          inviteCode:
            membership.role === "OWNER" ? membership.server.inviteCode : null,
        },
      })),
    };
  }),

  create: protectedProcedure
    .input(serverInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      const server = await ctx.db.chatServer.create({
        data: {
          name: input.name,
          description: input.description || null,
          createdById: currentUserId,
          members: {
            create: {
              userId: currentUserId,
              role: "OWNER",
            },
          },
        },
        select: { id: true },
      });

      return server;
    }),

  update: protectedProcedure
    .input(serverInput.extend({ serverId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.serverMember.findUnique({
        where: {
          serverId_userId: {
            serverId: input.serverId,
            userId: ctx.session.user.id,
          },
        },
        select: { role: true },
      });

      if (membership?.role !== "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "サーバー設定を変更できるのは鯖主だけです",
        });
      }

      return ctx.db.chatServer.update({
        where: { id: input.serverId },
        data: {
          name: input.name,
          description: input.description || null,
        },
        select: { id: true },
      });
    }),

  rotateInvite: protectedProcedure
    .input(z.object({ serverId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.serverMember.findUnique({
        where: {
          serverId_userId: {
            serverId: input.serverId,
            userId: ctx.session.user.id,
          },
        },
        select: { role: true },
      });

      if (membership?.role !== "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "招待リンクを再発行できるのは鯖主だけです",
        });
      }

      return ctx.db.chatServer.update({
        where: { id: input.serverId },
        data: { inviteCode: randomUUID() },
        select: { id: true, inviteCode: true },
      });
    }),
});
