import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { canManageServer } from "~/features/server/server/message-permissions";
import { enforceTRPCRateLimits } from "~/server/api/rate-limit";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const reportInput = z.object({
  details: z.string().trim().max(500).optional(),
  messageId: z.string().min(1),
  messageKind: z.enum(["DIRECT", "SERVER"]),
  reason: z.enum(["HARASSMENT", "SELF_HARM", "SPAM", "OTHER"]),
});

const serverIdInput = z.object({ serverId: z.string().min(1) });

export const moderationRouter = createTRPCRouter({
  reportMessage: protectedProcedure
    .input(reportInput)
    .mutation(async ({ ctx, input }) => {
      const reporterId = ctx.session.user.id;
      const details = input.details?.length ? input.details : null;

      await enforceTRPCRateLimits([
        {
          limit: 10,
          scope: "moderation:report:user",
          subject: reporterId,
          windowMs: 24 * 60 * 60 * 1000,
        },
      ]);

      const message =
        input.messageKind === "DIRECT"
          ? await ctx.db.directMessage.findFirst({
              where: {
                id: input.messageId,
                receiverId: reporterId,
              },
              select: {
                content: true,
                senderId: true,
              },
            })
          : await ctx.db.serverMessage.findFirst({
              where: {
                id: input.messageId,
                senderId: { not: reporterId },
                server: { members: { some: { userId: reporterId } } },
              },
              select: {
                content: true,
                senderId: true,
                serverId: true,
              },
            });

      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "通報できるメッセージが見つかりません",
        });
      }
      const serverId =
        "serverId" in message && typeof message.serverId === "string"
          ? message.serverId
          : null;

      const report = await ctx.db.messageReport.upsert({
        where: {
          reporterId_messageKind_messageId: {
            reporterId,
            messageId: input.messageId,
            messageKind: input.messageKind,
          },
        },
        create: {
          contentSnapshot: message.content,
          details,
          messageId: input.messageId,
          messageKind: input.messageKind,
          reason: input.reason,
          reportedUserId: message.senderId,
          reporterId,
          serverId,
        },
        update: {
          details,
          reason: input.reason,
          status: "OPEN",
          reviewedAt: null,
          reviewedById: null,
        },
        select: { createdAt: true, id: true },
      });

      return report;
    }),

  getServerReports: protectedProcedure
    .input(serverIdInput)
    .query(async ({ ctx, input }) => {
      const membership = await ctx.db.serverMember.findUnique({
        where: {
          serverId_userId: {
            serverId: input.serverId,
            userId: ctx.session.user.id,
          },
        },
        select: { role: true },
      });

      if (!canManageServer(membership?.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "通報を確認できるのはサーバー管理者だけです",
        });
      }

      return ctx.db.messageReport.findMany({
        where: { serverId: input.serverId },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 100,
        select: {
          contentSnapshot: true,
          createdAt: true,
          details: true,
          id: true,
          messageId: true,
          reason: true,
          reportedUser: {
            select: { name: true, userId: true },
          },
          reviewedAt: true,
          status: true,
        },
      });
    }),

  markServerReportReviewed: protectedProcedure
    .input(serverIdInput.extend({ reportId: z.string().min(1) }))
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

      if (!canManageServer(membership?.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "通報を処理できるのはサーバー管理者だけです",
        });
      }

      const result = await ctx.db.messageReport.updateMany({
        where: { id: input.reportId, serverId: input.serverId },
        data: {
          reviewedAt: new Date(),
          reviewedById: ctx.session.user.id,
          status: "REVIEWED",
        },
      });

      if (result.count !== 1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "通報が見つかりません",
        });
      }

      return { id: input.reportId };
    }),
});
