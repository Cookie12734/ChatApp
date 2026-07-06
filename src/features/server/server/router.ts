import { randomUUID } from "crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getBlockedPeerIds } from "~/features/friend/server/blocking";
import {
  canManageServer,
  canManageServerMember,
  canDeleteServerMessage,
  canEditMessage,
  canPinServerMessage,
  shouldDeleteServerOnLeave,
  countServerOwners,
  getVisibleServerMembers,
} from "~/features/server/server/message-permissions";
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

const messageIdInput = serverIdInput.extend({
  messageId: z.string().min(1),
});

const memberIdInput = serverIdInput.extend({
  memberId: z.string().min(1),
});

const memberRoleInput = memberIdInput.extend({
  role: z.enum(["MEMBER", "OWNER"]),
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

const updateMessageInput = messageIdInput.extend({
  content: sendMessageInput.shape.content,
});

function normalizeDescription(description: string | undefined) {
  if (description === undefined || description.length === 0) {
    return null;
  }

  return description;
}

function getServerMessageWhere({
  channelId,
  channelName,
  hiddenUserIds = [],
  readAt,
  serverId,
}: {
  channelId: string;
  channelName: string;
  hiddenUserIds?: string[];
  readAt?: Date;
  serverId: string;
}) {
  return {
    serverId,
    ...(channelName === "general"
      ? { OR: [{ channelId }, { channelId: null }] }
      : { channelId }),
    ...(hiddenUserIds.length > 0 ? { senderId: { notIn: hiddenUserIds } } : {}),
    ...(readAt ? { createdAt: { gt: readAt } } : {}),
  };
}

export const serverRouter = createTRPCRouter({
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    const currentUserId = ctx.session.user.id;

    const [currentUser, memberships, blocks] = await Promise.all([
      ctx.db.user.findUniqueOrThrow({
        where: { id: currentUserId },
        select: {
          id: true,
          userId: true,
          name: true,
          image: true,
          presenceStatus: true,
        },
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
                    select: {
                      id: true,
                      userId: true,
                      name: true,
                      image: true,
                      presenceStatus: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      ctx.db.userBlock.findMany({
        where: {
          OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
        },
        select: { blockedId: true, blockerId: true },
      }),
    ]);
    const blockedPeerIds = getBlockedPeerIds(currentUserId, blocks);
    const hiddenUnreadUserIds = [currentUserId, ...blockedPeerIds];

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
          const channelsWithUnread = await Promise.all(
            channels.map(async (channel) => {
              const read = await ctx.db.serverChannelRead.findUnique({
                where: {
                  channelId_userId: {
                    channelId: channel.id,
                    userId: currentUserId,
                  },
                },
                select: { readAt: true },
              });
              const unreadCount = await ctx.db.serverMessage.count({
                where: getServerMessageWhere({
                  channelId: channel.id,
                  channelName: channel.name,
                  hiddenUserIds: hiddenUnreadUserIds,
                  readAt: read?.readAt,
                  serverId: membership.server.id,
                }),
              });

              return { ...channel, unreadCount };
            }),
          );

          return {
            ...membership,
            server: {
              ...membership.server,
              channels: channelsWithUnread,
              inviteCode: canManageServer(membership.role)
                ? membership.server.inviteCode
                : null,
              members: getVisibleServerMembers(
                membership.server.members,
                blockedPeerIds,
              ),
              ownerCount: countServerOwners(membership.server.members),
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

      const blocks = await ctx.db.userBlock.findMany({
        where: {
          OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
        },
        select: { blockedId: true, blockerId: true },
      });
      const messageWhere = getServerMessageWhere({
        channelId: channel.id,
        channelName: channel.name,
        hiddenUserIds: getBlockedPeerIds(currentUserId, blocks),
        serverId: input.serverId,
      });

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
      await ctx.db.serverChannelRead.upsert({
        where: {
          channelId_userId: {
            channelId: channel.id,
            userId: currentUserId,
          },
        },
        create: {
          channelId: channel.id,
          userId: currentUserId,
        },
        update: { readAt: new Date() },
      });

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

  updateMessage: protectedProcedure
    .input(updateMessageInput)
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
          message: "参加しているサーバーだけ操作できます",
        });
      }

      const message = await ctx.db.serverMessage.findFirst({
        where: { id: input.messageId, serverId: input.serverId },
        select: { id: true, senderId: true },
      });

      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "メッセージが見つかりません",
        });
      }

      if (!canEditMessage(currentUserId, message.senderId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "編集できるのは自分のメッセージだけです",
        });
      }

      return ctx.db.serverMessage.update({
        where: { id: message.id },
        data: { content: input.content },
        select: { id: true, content: true },
      });
    }),

  toggleMessagePin: protectedProcedure
    .input(messageIdInput)
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

      if (!membership || !canPinServerMessage(membership.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ピン留めできるのは管理者だけです",
        });
      }

      const message = await ctx.db.serverMessage.findFirst({
        where: { id: input.messageId, serverId: input.serverId },
        select: { id: true, pinnedAt: true },
      });

      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "メッセージが見つかりません",
        });
      }

      const pinnedAt = message.pinnedAt ? null : new Date();

      return ctx.db.serverMessage.update({
        where: { id: message.id },
        data: { pinnedAt },
        select: { id: true, pinnedAt: true },
      });
    }),

  deleteMessage: protectedProcedure
    .input(messageIdInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const membership = await ctx.db.serverMember.findUnique({
        where: {
          serverId_userId: {
            serverId: input.serverId,
            userId: currentUserId,
          },
        },
        select: { role: true },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "参加しているサーバーだけ操作できます",
        });
      }

      const message = await ctx.db.serverMessage.findFirst({
        where: { id: input.messageId, serverId: input.serverId },
        select: { id: true, senderId: true },
      });

      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "メッセージが見つかりません",
        });
      }

      if (
        !canDeleteServerMessage(
          currentUserId,
          message.senderId,
          membership.role,
        )
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "削除できるのは自分のメッセージか管理者だけです",
        });
      }

      await ctx.db.serverMessage.delete({ where: { id: message.id } });
      return { id: message.id };
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

      if (!canManageServer(membership?.role)) {
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

      if (!canManageServer(membership?.role)) {
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

      if (!canManageServer(membership?.role)) {
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

      if (!canManageServer(membership?.role)) {
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

      if (!canManageServer(membership?.role)) {
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

  updateMemberRole: protectedProcedure
    .input(memberRoleInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const membership = await ctx.db.serverMember.findUnique({
        where: {
          serverId_userId: {
            serverId: input.serverId,
            userId: currentUserId,
          },
        },
        select: { role: true },
      });

      if (!canManageServer(membership?.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "メンバー権限を変更できるのは管理者だけです",
        });
      }

      const target = await ctx.db.serverMember.findFirst({
        where: { id: input.memberId, serverId: input.serverId },
        select: { id: true, userId: true },
      });

      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "メンバーが見つかりません",
        });
      }

      if (
        !canManageServerMember(membership.role, currentUserId, target.userId)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "自分の権限は変更できません",
        });
      }

      return ctx.db.serverMember.update({
        where: { id: target.id },
        data: { role: input.role },
        select: { id: true, role: true },
      });
    }),

  removeMember: protectedProcedure
    .input(memberIdInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const membership = await ctx.db.serverMember.findUnique({
        where: {
          serverId_userId: {
            serverId: input.serverId,
            userId: currentUserId,
          },
        },
        select: { role: true },
      });

      if (!canManageServer(membership?.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "メンバーを退出させられるのは管理者だけです",
        });
      }

      const target = await ctx.db.serverMember.findFirst({
        where: { id: input.memberId, serverId: input.serverId },
        select: { id: true, userId: true },
      });

      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "メンバーが見つかりません",
        });
      }

      if (
        !canManageServerMember(membership.role, currentUserId, target.userId)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "自分はサーバーメニューから退出してください",
        });
      }

      await ctx.db.$transaction([
        ctx.db.serverChannelRead.deleteMany({
          where: {
            userId: target.userId,
            channel: { serverId: input.serverId },
          },
        }),
        ctx.db.serverMember.delete({ where: { id: target.id } }),
      ]);
      return { id: target.id };
    }),

  deleteServer: protectedProcedure
    .input(serverIdInput)
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
          message: "サーバーを削除できるのは管理者だけです",
        });
      }

      await ctx.db.chatServer.delete({ where: { id: input.serverId } });
      return { serverId: input.serverId };
    }),

  leave: protectedProcedure
    .input(serverIdInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const membership = await ctx.db.serverMember.findUnique({
        where: {
          serverId_userId: {
            serverId: input.serverId,
            userId: currentUserId,
          },
        },
        select: { id: true, role: true },
      });

      if (!membership) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "参加しているサーバーが見つかりません",
        });
      }

      if (membership.role === "OWNER") {
        const ownerCount = await ctx.db.serverMember.count({
          where: { role: "OWNER", serverId: input.serverId },
        });

        if (shouldDeleteServerOnLeave(membership.role, ownerCount)) {
          await ctx.db.chatServer.delete({ where: { id: input.serverId } });
        } else {
          await ctx.db.$transaction([
            ctx.db.serverChannelRead.deleteMany({
              where: {
                userId: currentUserId,
                channel: { serverId: input.serverId },
              },
            }),
            ctx.db.serverMember.delete({ where: { id: membership.id } }),
          ]);
        }
      } else {
        await ctx.db.$transaction([
          ctx.db.serverChannelRead.deleteMany({
            where: {
              userId: currentUserId,
              channel: { serverId: input.serverId },
            },
          }),
          ctx.db.serverMember.delete({ where: { id: membership.id } }),
        ]);
      }

      return { serverId: input.serverId };
    }),
});
