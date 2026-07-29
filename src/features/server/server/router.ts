import { randomUUID } from "crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getBlockedPeerIds } from "~/features/friend/server/blocking";
import { getEffectivePresenceStatus } from "~/features/profile/presence";
import { isSameServerMessage } from "~/features/chat/server/message-idempotency";
import {
  decodeMessageCursor,
  getMessageCursorWhere,
  MESSAGE_PAGE_SIZE,
  prepareMessagePage,
} from "~/features/chat/message-page";
import {
  canManageServer,
  canManageServerMember,
  canDeleteServerMessage,
  canEditMessage,
  canPinServerMessage,
  isServerOwner,
} from "~/features/server/server/message-permissions";
import { addUnreadCountsToServerChannels } from "~/features/server/server/server-overview";
import { enforceTRPCRateLimits } from "~/server/api/rate-limit";
import { publishChatEvent } from "~/server/chat-events";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { addProfileImageUrl, getServerImageUrl } from "~/lib/static-image";

const MAX_CREATED_SERVERS = 10;
const MAX_JOINED_SERVERS = 100;
const MAX_SERVER_CHANNELS = 50;

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

const serverProfileInput = serverIdInput.extend({
  nickname: z
    .string()
    .trim()
    .max(32, "サーバー内の表示名は32文字以内で入力してください")
    .optional(),
  bio: z
    .string()
    .trim()
    .max(160, "サーバー内の自己紹介は160文字以内で入力してください")
    .optional(),
});

const conversationInput = serverIdInput.extend({
  channelId: z.string().min(1).optional(),
  cursor: z.string().nullish(),
});

const markChannelReadInput = channelIdInput.extend({
  messageId: z.string().min(1),
});

const sendMessageInput = serverIdInput.extend({
  channelId: z.string().min(1).optional(),
  clientId: z.string().uuid(),
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

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function getServerMessageWhere({
  channelId,
  channelName,
  readAt,
  serverId,
}: {
  channelId: string;
  channelName: string;
  readAt?: Date;
  serverId: string;
}) {
  return {
    serverId,
    ...(channelName === "general"
      ? { OR: [{ channelId }, { channelId: null }] }
      : { channelId }),
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
          presenceStatus: true,
        },
      }),
      ctx.db.serverMember.findMany({
        where: { userId: currentUserId },
        orderBy: { createdAt: "asc" },
        include: {
          server: {
            select: {
              id: true,
              name: true,
              description: true,
              inviteCode: true,
              createdById: true,
              createdAt: true,
              updatedAt: true,
              channels: {
                orderBy: { createdAt: "asc" },
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
    const missingChannelServerIds = memberships
      .filter((membership) => membership.server.channels.length === 0)
      .map((membership) => membership.server.id);
    const fallbackGeneralChannels = await (async () => {
      if (missingChannelServerIds.length === 0) return [];

      await ctx.db.serverChannel.createMany({
        data: missingChannelServerIds.map((serverId) => ({
          name: "general",
          serverId,
        })),
        skipDuplicates: true,
      });

      return ctx.db.serverChannel.findMany({
        where: {
          name: "general",
          serverId: { in: missingChannelServerIds },
        },
      });
    })();
    const fallbackGeneralChannelByServerId = new Map(
      fallbackGeneralChannels.map((channel) => [channel.serverId, channel]),
    );
    const normalizedMemberships = memberships.map((membership) => {
      if (membership.server.channels.length > 0) return membership;

      const generalChannel = fallbackGeneralChannelByServerId.get(
        membership.server.id,
      );

      if (!generalChannel) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to initialize the general channel",
        });
      }

      return {
        ...membership,
        server: {
          ...membership.server,
          channels: [generalChannel],
        },
      };
    });
    const channels = normalizedMemberships.flatMap(
      (membership) => membership.server.channels,
    );
    const channelReads =
      channels.length === 0
        ? []
        : await ctx.db.serverChannelRead.findMany({
            where: {
              channelId: { in: channels.map((channel) => channel.id) },
              userId: currentUserId,
            },
            select: { channelId: true, readAt: true },
          });
    const readAtByChannelId = new Map(
      channelReads.map((read) => [read.channelId, read.readAt]),
    );
    const unreadGroups =
      channels.length === 0
        ? []
        : await ctx.db.serverMessage.groupBy({
            by: ["serverId", "channelId"],
            where: {
              senderId: { notIn: hiddenUnreadUserIds },
              OR: channels.map((channel) =>
                getServerMessageWhere({
                  channelId: channel.id,
                  channelName: channel.name,
                  readAt: readAtByChannelId.get(channel.id),
                  serverId: channel.serverId,
                }),
              ),
            },
            _count: { _all: true },
          });

    return {
      currentUser: addProfileImageUrl(currentUser),
      memberships: normalizedMemberships.map((membership) => {
        return {
          ...membership,
          server: {
            ...membership.server,
            channels: addUnreadCountsToServerChannels(
              membership.server.channels,
              unreadGroups,
            ),
            inviteCode: canManageServer(membership.role)
              ? membership.server.inviteCode
              : null,
            image: getServerImageUrl(membership.server.id),
          },
        };
      }),
    };
  }),

  getMembers: protectedProcedure
    .input(serverIdInput)
    .query(async ({ ctx, input }) => {
      const server = await ctx.db.chatServer.findFirst({
        where: {
          id: input.serverId,
          members: { some: { userId: ctx.session.user.id } },
        },
        select: {
          members: {
            take: 250,
            orderBy: { createdAt: "asc" },
            include: {
              user: {
                select: {
                  id: true,
                  userId: true,
                  name: true,
                  lastSeenAt: true,
                  presenceStatus: true,
                },
              },
            },
          },
        },
      });

      if (!server) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "サーバーが見つかりません",
        });
      }

      return server.members.map((member) => {
        const { lastSeenAt, ...user } = member.user;

        return {
          ...member,
          user: {
            ...addProfileImageUrl(user),
            presenceStatus: getEffectivePresenceStatus(
              user.presenceStatus,
              lastSeenAt,
            ),
          },
        };
      });
    }),

  create: protectedProcedure
    .input(serverInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      await enforceTRPCRateLimits([
        {
          limit: 3,
          scope: "server:create:user",
          subject: currentUserId,
          windowMs: 10 * 60 * 1000,
        },
      ]);

      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "User"
          WHERE "id" = ${currentUserId}
          FOR UPDATE
        `;

        const [serverCount, membershipCount] = await Promise.all([
          tx.chatServer.count({
            where: { createdById: currentUserId },
          }),
          tx.serverMember.count({ where: { userId: currentUserId } }),
        ]);

        if (serverCount >= MAX_CREATED_SERVERS) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "作成できるサーバーは10件までです",
          });
        }
        if (membershipCount >= MAX_JOINED_SERVERS) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "参加できるサーバーは100件までです",
          });
        }

        return tx.chatServer.create({
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
      });
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
        : await ctx.db.serverChannel.findFirst({
            where: { serverId: input.serverId },
            orderBy: { createdAt: "asc" },
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
      const blockedPeerIds = getBlockedPeerIds(currentUserId, blocks);
      const messageWhere = {
        ...getServerMessageWhere({
          channelId: channel.id,
          channelName: channel.name,
          serverId: input.serverId,
        }),
        ...(blockedPeerIds.length > 0
          ? { senderId: { notIn: blockedPeerIds } }
          : {}),
      };
      const messageInclude = {
        sender: {
          select: {
            id: true,
            userId: true,
            name: true,
            serverMemberships: {
              where: { serverId: input.serverId },
              select: { nickname: true },
            },
          },
        },
      };
      const stableCursor = decodeMessageCursor(input.cursor);
      const legacyCursor =
        input.cursor && !stableCursor
          ? await ctx.db.serverMessage.findFirst({
              where: { id: input.cursor, ...messageWhere },
              select: { id: true },
            })
          : null;

      const [currentUser, server, messages, pinnedMessages, channelRead] =
        await Promise.all([
          ctx.db.user.findUniqueOrThrow({
            where: { id: currentUserId },
            select: { id: true, userId: true, name: true },
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
            cursor: legacyCursor ? { id: legacyCursor.id } : undefined,
            where: {
              ...messageWhere,
              ...(stableCursor
                ? { AND: [getMessageCursorWhere(stableCursor)] }
                : {}),
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: MESSAGE_PAGE_SIZE + 1,
            include: messageInclude,
          }),
          ctx.db.serverMessage.findMany({
            where: { ...messageWhere, pinnedAt: { not: null } },
            orderBy: { pinnedAt: "desc" },
            take: 50,
            include: messageInclude,
          }),
          ctx.db.serverChannelRead.findUnique({
            where: {
              channelId_userId: {
                channelId: channel.id,
                userId: currentUserId,
              },
            },
            select: { readAt: true },
          }),
        ]);
      return {
        channel,
        currentUser: addProfileImageUrl(currentUser),
        readAt: channelRead?.readAt ?? null,
        server,
        pinnedMessages: pinnedMessages.map((message) => ({
          ...message,
          sender: addProfileImageUrl(message.sender),
        })),
        ...prepareMessagePage(
          messages.map((message) => ({
            ...message,
            sender: addProfileImageUrl(message.sender),
          })),
        ),
      };
    }),

  markChannelRead: protectedProcedure
    .input(markChannelReadInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const channel = await ctx.db.serverChannel.findFirst({
        where: {
          id: input.channelId,
          serverId: input.serverId,
          server: { members: { some: { userId: currentUserId } } },
        },
        select: { id: true, name: true },
      });

      if (!channel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "チャンネルが見つかりません",
        });
      }

      const message = await ctx.db.serverMessage.findFirst({
        where: {
          id: input.messageId,
          ...getServerMessageWhere({
            channelId: channel.id,
            channelName: channel.name,
            serverId: input.serverId,
          }),
        },
        select: { createdAt: true },
      });

      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "メッセージが見つかりません",
        });
      }

      await ctx.db.$transaction([
        ctx.db.serverChannelRead.createMany({
          data: {
            channelId: channel.id,
            userId: currentUserId,
            readAt: message.createdAt,
          },
          skipDuplicates: true,
        }),
        ctx.db.serverChannelRead.updateMany({
          where: {
            channelId: channel.id,
            userId: currentUserId,
            readAt: { lt: message.createdAt },
          },
          data: { readAt: message.createdAt },
        }),
      ]);

      return { ok: true, readThrough: message.createdAt };
    }),

  updateMyProfile: protectedProcedure
    .input(serverProfileInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.serverMember.findUnique({
        where: {
          serverId_userId: {
            serverId: input.serverId,
            userId: ctx.session.user.id,
          },
        },
        select: { id: true },
      });

      if (!membership) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "参加しているサーバーが見つかりません",
        });
      }

      return ctx.db.serverMember.update({
        where: { id: membership.id },
        data: {
          nickname: normalizeOptionalText(input.nickname),
          bio: normalizeOptionalText(input.bio),
        },
        select: {
          bio: true,
          id: true,
          nickname: true,
          serverId: true,
          userId: true,
        },
      });
    }),

  sendMessage: protectedProcedure
    .input(sendMessageInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      await enforceTRPCRateLimits([
        {
          limit: 30,
          scope: "chat:message:user",
          subject: currentUserId,
          windowMs: 10 * 1000,
        },
      ]);

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
        : await ctx.db.serverChannel.findFirst({
            where: { serverId: input.serverId },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          });

      if (!channel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "チャンネルが見つかりません",
        });
      }

      const content = input.content.trim();
      const message = await ctx.db.serverMessage.upsert({
        where: {
          senderId_clientId: {
            clientId: input.clientId,
            senderId: currentUserId,
          },
        },
        create: {
          channelId: channel.id,
          clientId: input.clientId,
          content,
          senderId: currentUserId,
          serverId: input.serverId,
        },
        update: { clientId: input.clientId },
      });

      if (
        !isSameServerMessage(message, {
          channelId: channel.id,
          content,
          serverId: input.serverId,
        })
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "同じ送信IDを別のメッセージには使用できません",
        });
      }

      void publishChatEvent(ctx.db, {
        change: "created",
        channelId: channel.id,
        kind: "server",
        senderId: currentUserId,
        serverId: input.serverId,
      });
      return message;
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
        select: { channelId: true, id: true, senderId: true },
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

      const updatedMessage = await ctx.db.serverMessage.update({
        where: { id: message.id },
        data: { content: input.content },
        select: { id: true, content: true },
      });

      void publishChatEvent(ctx.db, {
        change: "updated",
        channelId: message.channelId,
        kind: "server",
        senderId: message.senderId,
        serverId: input.serverId,
      });
      return updatedMessage;
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
        select: { channelId: true, id: true, pinnedAt: true, senderId: true },
      });

      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "メッセージが見つかりません",
        });
      }

      const pinnedAt = message.pinnedAt ? null : new Date();

      const updatedMessage = await ctx.db.serverMessage.update({
        where: { id: message.id },
        data: { pinnedAt },
        select: { id: true, pinnedAt: true },
      });

      void publishChatEvent(ctx.db, {
        change: "updated",
        channelId: message.channelId,
        kind: "server",
        senderId: message.senderId,
        serverId: input.serverId,
      });
      return updatedMessage;
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
        select: { channelId: true, id: true, senderId: true },
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
      void publishChatEvent(ctx.db, {
        change: "deleted",
        channelId: message.channelId,
        kind: "server",
        senderId: message.senderId,
        serverId: input.serverId,
      });
      return { id: message.id };
    }),

  createChannel: protectedProcedure
    .input(channelInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "ChatServer"
          WHERE "id" = ${input.serverId}
          FOR UPDATE
        `;

        const membership = await tx.serverMember.findUnique({
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

        const existing = await tx.serverChannel.findUnique({
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

        const channelCount = await tx.serverChannel.count({
          where: { serverId: input.serverId },
        });

        if (channelCount >= MAX_SERVER_CHANNELS) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "チャンネルは50件までです",
          });
        }

        return tx.serverChannel.create({
          data: {
            name: input.name,
            serverId: input.serverId,
          },
        });
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
      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "ChatServer"
          WHERE "id" = ${input.serverId}
          FOR UPDATE
        `;

        const membership = await tx.serverMember.findUnique({
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

        const channelCount = await tx.serverChannel.count({
          where: { serverId: input.serverId },
        });

        if (channelCount <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "最後のチャンネルは削除できません",
          });
        }

        const channel = await tx.serverChannel.findFirst({
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

        return tx.serverChannel.delete({
          where: { id: input.channelId },
        });
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
      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "ChatServer"
          WHERE "id" = ${input.serverId}
          FOR UPDATE
        `;

        const membership = await tx.serverMember.findUnique({
          where: {
            serverId_userId: {
              serverId: input.serverId,
              userId: currentUserId,
            },
          },
          select: {
            role: true,
            server: { select: { createdById: true } },
          },
        });

        if (
          !membership ||
          !isServerOwner(membership.server.createdById, currentUserId)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "メンバー権限を変更できるのはサーバー所有者だけです",
          });
        }

        const target = await tx.serverMember.findFirst({
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

        if (input.role === "OWNER") {
          await tx.serverMember.updateMany({
            where: { role: "OWNER", serverId: input.serverId },
            data: { role: "MEMBER" },
          });
          const newOwner = await tx.serverMember.update({
            where: { id: target.id },
            data: { role: "OWNER" },
            select: { id: true, role: true },
          });
          await tx.chatServer.update({
            where: { id: input.serverId },
            data: { createdById: target.userId },
          });

          return newOwner;
        }

        return tx.serverMember.update({
          where: { id: target.id },
          data: { role: input.role },
          select: { id: true, role: true },
        });
      });
    }),

  removeMember: protectedProcedure
    .input(memberIdInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "ChatServer"
          WHERE "id" = ${input.serverId}
          FOR UPDATE
        `;

        const membership = await tx.serverMember.findUnique({
          where: {
            serverId_userId: {
              serverId: input.serverId,
              userId: currentUserId,
            },
          },
          select: {
            role: true,
            server: { select: { createdById: true } },
          },
        });

        if (
          !membership ||
          !isServerOwner(membership.server.createdById, currentUserId)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "メンバーを退出させられるのはサーバー所有者だけです",
          });
        }

        const target = await tx.serverMember.findFirst({
          where: { id: input.memberId, serverId: input.serverId },
          select: { id: true, userId: true },
        });

        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "メンバーが見つかりません",
          });
        }

        if (isServerOwner(membership.server.createdById, target.userId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "サーバー所有者は退出させられません",
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

        await tx.serverChannelRead.deleteMany({
          where: {
            userId: target.userId,
            channel: { serverId: input.serverId },
          },
        });
        await tx.serverMember.delete({ where: { id: target.id } });
        return { id: target.id };
      });
    }),

  deleteServer: protectedProcedure
    .input(serverIdInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "ChatServer"
          WHERE "id" = ${input.serverId}
          FOR UPDATE
        `;

        const membership = await tx.serverMember.findUnique({
          where: {
            serverId_userId: {
              serverId: input.serverId,
              userId: currentUserId,
            },
          },
          select: { server: { select: { createdById: true } } },
        });

        if (
          !membership ||
          !isServerOwner(membership.server.createdById, currentUserId)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "サーバーを削除できるのはサーバー所有者だけです",
          });
        }

        await tx.chatServer.delete({ where: { id: input.serverId } });
        return { serverId: input.serverId };
      });
    }),

  leave: protectedProcedure
    .input(serverIdInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "ChatServer"
          WHERE "id" = ${input.serverId}
          FOR UPDATE
        `;

        const membership = await tx.serverMember.findUnique({
          where: {
            serverId_userId: {
              serverId: input.serverId,
              userId: currentUserId,
            },
          },
          select: {
            id: true,
            server: { select: { createdById: true } },
          },
        });

        if (!membership) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "参加しているサーバーが見つかりません",
          });
        }

        if (isServerOwner(membership.server.createdById, currentUserId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "所有権を別のメンバーへ移譲してから退出してください",
          });
        }

        await tx.serverChannelRead.deleteMany({
          where: {
            userId: currentUserId,
            channel: { serverId: input.serverId },
          },
        });
        await tx.serverMember.delete({ where: { id: membership.id } });

        return { serverId: input.serverId };
      });
    }),
});
