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

const serverIdInput = z.object({
  serverId: z.string().min(1),
});

const channelNameInput = z
  .string()
  .trim()
  .min(1, "チャンネル名を入力してください")
  .max(32, "チャンネル名は32文字以内で入力してください")
  .transform((name) => name.toLowerCase());

const channelInput = serverIdInput.extend({
  name: channelNameInput,
});

const channelIdInput = serverIdInput.extend({
  channelId: z.string().min(1),
});

const conversationInput = serverIdInput.extend({
  channelId: z.string().min(1).optional(),
});

const sendMessageInput = serverIdInput.extend({
  channelId: z.string().min(1).optional(),
  content: z
    .string()
    .trim()
    .min(1, "メッセージを入力してください")
    .max(1000, "メッセージは1000文字以内で入力してください"),
});

function normalizeDescription(description: string | undefined) {
  if (description === undefined || description.length === 0) {
    return null;
  }

  return description;
}

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
              channels: {
                orderBy: { createdAt: "asc" },
              },
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
      memberships: await Promise.all(
        memberships.map(async (membership) => {
          const channels =
            membership.server.channels.length > 0
              ? membership.server.channels
              : [
                  await ctx.db.serverChannel.upsert({
                    where: {
                      serverId_name: {
                        serverId: membership.server.id,
                        name: "general",
                      },
                    },
                    create: {
                      name: "general",
                      serverId: membership.server.id,
                    },
                    update: {},
                  }),
                ];

          return {
            ...membership,
            server: {
              ...membership.server,
              channels,
              inviteCode:
                membership.role === "OWNER"
                  ? membership.server.inviteCode
                  : null,
            },
          };
        }),
      ),
    };
  }),

  create: protectedProcedure
    .input(serverInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      const server = await ctx.db.chatServer.create({
        data: {
          name: input.name,
          description: normalizeDescription(input.description),
          createdById: currentUserId,
          channels: {
            create: {
              name: "general",
            },
          },
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

  getConversation: protectedProcedure
    .input(conversationInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      const membership = await ctx.db.serverMember.findUnique({
        where: {
          serverId_userId: {
            serverId: input.serverId,
            userId: currentUserId,
          },
        },
        select: { id: true },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "参加しているサーバーだけ開けます",
        });
      }

      const channel = input.channelId
        ? await ctx.db.serverChannel.findFirst({
            where: {
              id: input.channelId,
              serverId: input.serverId,
            },
          })
        : await ctx.db.serverChannel.upsert({
            where: {
              serverId_name: {
                serverId: input.serverId,
                name: "general",
              },
            },
            create: {
              name: "general",
              serverId: input.serverId,
            },
            update: {},
          });

      if (!channel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "チャンネルが見つかりません",
        });
      }

      const messageWhere =
        channel.name === "general"
          ? {
              serverId: input.serverId,
              OR: [{ channelId: channel.id }, { channelId: null }],
            }
          : { channelId: channel.id, serverId: input.serverId };

      const [currentUser, server, messages] = await Promise.all([
        ctx.db.user.findUniqueOrThrow({
          where: { id: currentUserId },
          select: { id: true, userId: true, name: true, image: true },
        }),
        ctx.db.chatServer.findUniqueOrThrow({
          where: { id: input.serverId },
          select: {
            id: true,
            name: true,
            description: true,
          },
        }),
        ctx.db.serverMessage.findMany({
          where: messageWhere,
          orderBy: { createdAt: "asc" },
          take: 100,
          include: {
            sender: {
              select: { id: true, userId: true, name: true, image: true },
            },
          },
        }),
      ]);

      return {
        channel,
        currentUser,
        server,
        messages,
      };
    }),

  sendMessage: protectedProcedure
    .input(sendMessageInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      const membership = await ctx.db.serverMember.findUnique({
        where: {
          serverId_userId: {
            serverId: input.serverId,
            userId: currentUserId,
          },
        },
        select: { id: true },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "参加しているサーバーにだけメッセージを送れます",
        });
      }

      const channel = input.channelId
        ? await ctx.db.serverChannel.findFirst({
            where: {
              id: input.channelId,
              serverId: input.serverId,
            },
            select: { id: true },
          })
        : await ctx.db.serverChannel.upsert({
            where: {
              serverId_name: {
                serverId: input.serverId,
                name: "general",
              },
            },
            create: {
              name: "general",
              serverId: input.serverId,
            },
            update: {},
            select: { id: true },
          });

      if (!channel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "チャンネルが見つかりません",
        });
      }

      return ctx.db.serverMessage.create({
        data: {
          channelId: channel.id,
          content: input.content.trim(),
          senderId: currentUserId,
          serverId: input.serverId,
        },
      });
    }),

  createChannel: protectedProcedure
    .input(channelInput)
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
          message: "チャンネルを追加できるのは管理者だけです",
        });
      }

      const existing = await ctx.db.serverChannel.findUnique({
        where: {
          serverId_name: {
            serverId: input.serverId,
            name: input.name,
          },
        },
        select: { id: true },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "同じ名前のチャンネルがあります",
        });
      }

      return ctx.db.serverChannel.create({
        data: {
          name: input.name,
          serverId: input.serverId,
        },
      });
    }),

  updateChannel: protectedProcedure
    .input(channelIdInput.extend({ name: channelNameInput }))
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
          message: "チャンネルを編集できるのは管理者だけです",
        });
      }

      const channel = await ctx.db.serverChannel.findFirst({
        where: {
          id: input.channelId,
          serverId: input.serverId,
        },
        select: { id: true, name: true },
      });

      if (!channel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "チャンネルが見つかりません",
        });
      }

      if (channel.name !== input.name) {
        const existing = await ctx.db.serverChannel.findUnique({
          where: {
            serverId_name: {
              serverId: input.serverId,
              name: input.name,
            },
          },
          select: { id: true },
        });

        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "同じ名前のチャンネルがあります",
          });
        }
      }

      return ctx.db.serverChannel.update({
        where: { id: input.channelId },
        data: { name: input.name },
      });
    }),

  deleteChannel: protectedProcedure
    .input(channelIdInput)
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
          message: "チャンネルを削除できるのは管理者だけです",
        });
      }

      const channelCount = await ctx.db.serverChannel.count({
        where: { serverId: input.serverId },
      });

      if (channelCount <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "最後のチャンネルは削除できません",
        });
      }

      const channel = await ctx.db.serverChannel.findFirst({
        where: {
          id: input.channelId,
          serverId: input.serverId,
        },
        select: { id: true },
      });

      if (!channel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "チャンネルが見つかりません",
        });
      }

      return ctx.db.serverChannel.delete({
        where: { id: input.channelId },
      });
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
          message: "サーバー設定を変更できるのは管理者だけです",
        });
      }

      return ctx.db.chatServer.update({
        where: { id: input.serverId },
        data: {
          name: input.name,
          description: normalizeDescription(input.description),
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
          message: "招待リンクを再発行できるのは管理者だけです",
        });
      }

      return ctx.db.chatServer.update({
        where: { id: input.serverId },
        data: { inviteCode: randomUUID() },
        select: { id: true, inviteCode: true },
      });
    }),
});
