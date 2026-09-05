import { randomUUID } from "crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getBlockedPeerIds } from "~/features/friend/server/blocking";
import { assertNotBlocked } from "~/features/friend/server/blocking";
import { getEffectivePresenceStatus } from "~/features/profile/presence";
import { isSameServerMessage } from "~/features/chat/server/message-idempotency";
import {
  decodeMessageCursor,
  encodeMessageCursor,
  getMessageCursorWhere,
  MESSAGE_PAGE_SIZE,
  prepareMessagePage,
} from "~/features/chat/message-page";
import {
  canManageServerChannels,
  canManageServerInvites,
  canManageServer,
  canManageServerMember,
  canManageServerMembers,
  canChangeServerMemberRole,
  canDeleteServerMessage,
  canEditServerMessage,
  canPinServerMessage,
  canReactToServerMessage,
  canRemoveServerMember,
  canSendServerMessage,
  isServerOwner,
  SERVER_ROLES,
} from "~/features/server/server/message-permissions";
import { addUnreadCountsToServerChannels } from "~/features/server/server/server-overview";
import { enforceTRPCRateLimits } from "~/server/api/rate-limit";
import { publishChatEvent } from "~/server/chat-events";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { normalizeOptionalText } from "~/lib/input";
import { addProfileImageUrl, getServerImageUrl } from "~/lib/static-image";
import { sendPushNotification } from "~/features/notification/server/push";

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
  role: z.enum(SERVER_ROLES),
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
  attachmentIds: z.array(z.string().min(1)).max(4).default([]),
  channelId: z.string().min(1).optional(),
  clientId: z.string().uuid(),
  content: z
    .string()
    .trim()
    .min(1, "メッセージを入力してください")
    .max(1000, "メッセージは1000文字以内で入力してください"),
  replyToId: z.string().min(1).optional(),
});

const reactionEmoji = z.enum([
  "\u{1F44D}",
  "\u{2764}\u{FE0F}",
  "\u{1F602}",
  "\u{1F389}",
  "\u{1F62E}",
  "\u{1F64F}",
]);

const serverCategory = z.enum([
  "COMMUNITY",
  "GAMES",
  "STUDY",
  "HOBBIES",
  "WELLBEING",
  "OTHER",
]);

function getServerMessageInclude(
  currentUserId: string,
  serverId: string,
  blockedPeerIds: string[],
) {
  return {
    attachments: {
      select: {
        fileName: true,
        id: true,
        kind: true,
        mimeType: true,
        size: true,
      },
    },
    reactions: { select: { emoji: true, userId: true } },
    replyTo: {
      where:
        blockedPeerIds.length > 0
          ? { senderId: { notIn: blockedPeerIds } }
          : undefined,
      select: {
        content: true,
        id: true,
        sender: { select: { id: true, name: true, userId: true } },
      },
    },
    savedBy: {
      where: { userId: currentUserId },
      select: { userId: true },
    },
    sender: {
      select: {
        id: true,
        userId: true,
        name: true,
        serverMemberships: {
          where: { serverId },
          select: { nickname: true },
        },
      },
    },
  };
}

const discoveryTags = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(20)
      .regex(
        /^[\p{L}\p{N}-]+$/u,
        "タグは文字・数字・ハイフンで入力してください",
      ),
  )
  .max(5)
  .transform((tags) => [...new Set(tags)]);

const searchPublicServersInput = z
  .object({
    category: serverCategory.optional(),
    cursor: z.string().nullish(),
    limit: z.number().int().min(1).max(30).default(20),
    maxMembers: z.number().int().min(1).max(250).optional(),
    minMembers: z.number().int().min(1).max(250).optional(),
    query: z.string().trim().max(80).optional(),
    tags: discoveryTags.optional(),
  })
  .refine(
    ({ maxMembers, minMembers }) =>
      maxMembers === undefined ||
      minMembers === undefined ||
      minMembers <= maxMembers,
    { message: "人数の範囲が正しくありません", path: ["maxMembers"] },
  );

const updateDiscoveryInput = serverIdInput.extend({
  category: serverCategory.nullable().optional(),
  tags: discoveryTags,
  visibility: z.enum(["PRIVATE", "PUBLIC"]),
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
  searchPublic: protectedProcedure
    .input(searchPublicServersInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceTRPCRateLimits([
        {
          limit: 30,
          scope: "server:discovery:user",
          subject: currentUserId,
          windowMs: 60 * 1000,
        },
      ]);
      const cursor = decodeMessageCursor(input.cursor);
      if (input.cursor && !cursor) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "検索位置が無効です",
        });
      }
      const memberRangeIds =
        input.minMembers !== undefined || input.maxMembers !== undefined
          ? await ctx.db.$queryRaw<Array<{ serverId: string }>>`
              SELECT "serverId"
              FROM "ServerMember"
              GROUP BY "serverId"
              HAVING COUNT(*) >= ${input.minMembers ?? 1}
                AND COUNT(*) <= ${input.maxMembers ?? 250}
            `
          : undefined;
      if (memberRangeIds?.length === 0) {
        return { nextCursor: undefined, servers: [] };
      }
      const servers = await ctx.db.chatServer.findMany({
        where: {
          category: input.category,
          id: memberRangeIds
            ? { in: memberRangeIds.map(({ serverId }) => serverId) }
            : undefined,
          visibility: "PUBLIC",
          ...(input.query
            ? {
                OR: [
                  { name: { contains: input.query, mode: "insensitive" } },
                  {
                    description: {
                      contains: input.query,
                      mode: "insensitive",
                    },
                  },
                ],
              }
            : {}),
          ...(input.tags?.length ? { tags: { hasSome: input.tags } } : {}),
          ...(cursor ? { AND: [getMessageCursorWhere(cursor)] } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        select: {
          _count: { select: { members: true } },
          category: true,
          createdAt: true,
          description: true,
          id: true,
          members: {
            where: { userId: currentUserId },
            select: { id: true },
            take: 1,
          },
          name: true,
          tags: true,
        },
      });
      const boundary =
        servers.length > input.limit ? servers[input.limit - 1] : undefined;
      return {
        nextCursor: boundary ? encodeMessageCursor(boundary) : undefined,
        servers: servers.slice(0, input.limit).map((server) => ({
          category: server.category,
          description: server.description,
          id: server.id,
          image: getServerImageUrl(server.id),
          isMember: server.members.length > 0,
          memberCount: server._count.members,
          name: server.name,
          tags: server.tags,
        })),
      };
    }),

  updateDiscovery: protectedProcedure
    .input(updateDiscoveryInput)
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
          message: "公開設定を変更する権限がありません",
        });
      }
      return ctx.db.chatServer.update({
        where: { id: input.serverId },
        data: {
          category: input.category ?? null,
          tags: input.tags,
          visibility: input.visibility,
        },
        select: { category: true, id: true, tags: true, visibility: true },
      });
    }),

  joinPublic: protectedProcedure
    .input(serverIdInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceTRPCRateLimits([
        {
          limit: 20,
          scope: "server:join:user",
          subject: currentUserId,
          windowMs: 60 * 60 * 1000,
        },
      ]);
      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "ChatServer"
          WHERE "id" = ${input.serverId}
          FOR UPDATE
        `;
        const server = await tx.chatServer.findUnique({
          where: { id: input.serverId },
          select: { id: true, visibility: true },
        });
        if (server?.visibility !== "PUBLIC") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "公開サーバーが見つかりません",
          });
        }
        const existing = await tx.serverMember.findUnique({
          where: {
            serverId_userId: {
              serverId: input.serverId,
              userId: currentUserId,
            },
          },
          select: { id: true },
        });
        if (existing) return { alreadyMember: true, serverId: input.serverId };

        const [joinedCount, memberCount] = await Promise.all([
          tx.serverMember.count({ where: { userId: currentUserId } }),
          tx.serverMember.count({ where: { serverId: input.serverId } }),
        ]);
        if (joinedCount >= MAX_JOINED_SERVERS) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "参加できるサーバー数の上限です",
          });
        }
        if (memberCount >= 250) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "このサーバーは満員です",
          });
        }
        await tx.serverMember.create({
          data: { serverId: input.serverId, userId: currentUserId },
        });
        return { alreadyMember: false, serverId: input.serverId };
      });
    }),

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
              category: true,
              inviteCode: true,
              tags: true,
              visibility: true,
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
            inviteCode: canManageServerInvites(membership.role)
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
        select: { id: true, role: true },
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
      const messageInclude = getServerMessageInclude(
        currentUserId,
        input.serverId,
        blockedPeerIds,
      );
      const stableCursor = decodeMessageCursor(input.cursor);
      const legacyCursor =
        input.cursor && !stableCursor
          ? await ctx.db.serverMessage.findFirst({
              where: { id: input.cursor, ...messageWhere },
              select: { id: true },
            })
          : null;

      const [currentUser, server, messages, channelRead] = await Promise.all([
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
        ...prepareMessagePage(
          messages.map((message) => ({
            ...message,
            sender: addProfileImageUrl(message.sender),
          })),
        ),
      };
    }),

  getPinnedMessages: protectedProcedure
    .input(channelIdInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const [membership, channel, blocks] = await Promise.all([
        ctx.db.serverMember.findUnique({
          where: {
            serverId_userId: {
              serverId: input.serverId,
              userId: currentUserId,
            },
          },
          select: { id: true },
        }),
        ctx.db.serverChannel.findFirst({
          where: { id: input.channelId, serverId: input.serverId },
          select: { id: true, name: true },
        }),
        ctx.db.userBlock.findMany({
          where: {
            OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
          },
          select: { blockedId: true, blockerId: true },
        }),
      ]);
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "参加しているサーバーだけ開けます",
        });
      }
      if (!channel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "チャンネルが見つかりません",
        });
      }

      const blockedPeerIds = getBlockedPeerIds(currentUserId, blocks);
      const messages = await ctx.db.serverMessage.findMany({
        where: {
          ...getServerMessageWhere({
            channelId: channel.id,
            channelName: channel.name,
            serverId: input.serverId,
          }),
          pinnedAt: { not: null },
          ...(blockedPeerIds.length > 0
            ? { senderId: { notIn: blockedPeerIds } }
            : {}),
        },
        orderBy: { pinnedAt: "desc" },
        take: 50,
        include: getServerMessageInclude(
          currentUserId,
          input.serverId,
          blockedPeerIds,
        ),
      });
      return messages.map((message) => ({
        ...message,
        sender: addProfileImageUrl(message.sender),
      }));
    }),

  getMessage: protectedProcedure
    .input(messageIdInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const [membership, blocks] = await Promise.all([
        ctx.db.serverMember.findUnique({
          where: {
            serverId_userId: {
              serverId: input.serverId,
              userId: currentUserId,
            },
          },
          select: { id: true },
        }),
        ctx.db.userBlock.findMany({
          where: {
            OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
          },
          select: { blockedId: true, blockerId: true },
        }),
      ]);
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "参加しているサーバーだけ開けます",
        });
      }

      const blockedPeerIds = getBlockedPeerIds(currentUserId, blocks);
      const message = await ctx.db.serverMessage.findFirst({
        where: {
          id: input.messageId,
          serverId: input.serverId,
          ...(blockedPeerIds.length > 0
            ? { senderId: { notIn: blockedPeerIds } }
            : {}),
        },
        include: getServerMessageInclude(
          currentUserId,
          input.serverId,
          blockedPeerIds,
        ),
      });
      return message
        ? { ...message, sender: addProfileImageUrl(message.sender) }
        : null;
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
        select: { id: true, role: true },
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
        select: { id: true, role: true },
      });

      if (!membership || !canSendServerMessage(membership.role)) {
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

      if (input.replyToId) {
        const replyTarget = await ctx.db.serverMessage.findFirst({
          where: {
            channelId: channel.id,
            id: input.replyToId,
            serverId: input.serverId,
          },
          select: { id: true },
        });
        if (!replyTarget) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "返信元のメッセージが見つかりません",
          });
        }
      }

      const content = input.content.trim();
      const message = await ctx.db.$transaction(async (tx) => {
        const storedMessage = await tx.serverMessage.upsert({
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
            replyToId: input.replyToId,
            senderId: currentUserId,
            serverId: input.serverId,
          },
          update: { clientId: input.clientId },
        });

        if (
          !isSameServerMessage(storedMessage, {
            channelId: channel.id,
            content,
            serverId: input.serverId,
          }) ||
          storedMessage.replyToId !== (input.replyToId ?? null)
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "同じ送信IDを別のメッセージには使用できません",
          });
        }

        if (input.attachmentIds.length > 0) {
          const attachmentIds = [...new Set(input.attachmentIds)];
          const attachments = await tx.messageAttachment.findMany({
            where: {
              directMessageId: null,
              groupMessageId: null,
              id: { in: attachmentIds },
              OR: [
                { serverMessageId: storedMessage.id },
                { expiresAt: { gt: new Date() }, serverMessageId: null },
              ],
              uploaderId: currentUserId,
            },
            select: { id: true },
          });
          if (
            attachmentIds.length !== input.attachmentIds.length ||
            attachments.length !== attachmentIds.length
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "添付ファイルが無効か期限切れです",
            });
          }
          await tx.messageAttachment.updateMany({
            where: { id: { in: attachmentIds }, serverMessageId: null },
            data: { expiresAt: null, serverMessageId: storedMessage.id },
          });
        }
        return storedMessage;
      });

      void publishChatEvent(ctx.db, {
        change: "created",
        channelId: channel.id,
        kind: "server",
        messageId: message.id,
        senderId: currentUserId,
        serverId: input.serverId,
      });
      const mentionedUserIds = [
        ...content.matchAll(/(?<![a-zA-Z0-9_])@([a-zA-Z0-9_]{3,32})/g),
      ].flatMap((match) => (match[1] ? [match[1]] : []));
      if (mentionedUserIds.length > 0) {
        const mentionedMembers = await ctx.db.serverMember.findMany({
          where: {
            serverId: input.serverId,
            userId: { not: currentUserId },
            user: {
              userId: { in: [...new Set(mentionedUserIds)] },
              NOT: {
                OR: [
                  { blockedBy: { some: { blockerId: currentUserId } } },
                  { blockedUsers: { some: { blockedId: currentUserId } } },
                ],
              },
            },
          },
          select: { userId: true },
        });
        for (const mentionedMember of mentionedMembers) {
          await sendPushNotification(ctx.db, {
            body: content,
            kind: "MENTION",
            recipientId: mentionedMember.userId,
            title: "メンションされました",
            url: "/",
          });
        }
      }
      return message;
    }),

  toggleMessageReaction: protectedProcedure
    .input(messageIdInput.extend({ emoji: reactionEmoji }))
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
      if (!canReactToServerMessage(membership?.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "リアクションを追加する権限がありません",
        });
      }
      const message = await ctx.db.serverMessage.findFirst({
        where: { id: input.messageId, serverId: input.serverId },
        select: { channelId: true, id: true, senderId: true },
      });
      if (!message) throw new TRPCError({ code: "NOT_FOUND" });
      await assertNotBlocked(ctx.db, currentUserId, message.senderId);

      const result = await ctx.db.$transaction(async (tx) => {
        const key = {
          messageId_userId_emoji: {
            emoji: input.emoji,
            messageId: message.id,
            userId: currentUserId,
          },
        };
        const existing = await tx.serverMessageReaction.findUnique({
          where: key,
          select: { messageId: true },
        });
        if (existing) await tx.serverMessageReaction.delete({ where: key });
        else {
          await tx.serverMessageReaction.create({
            data: {
              emoji: input.emoji,
              messageId: message.id,
              userId: currentUserId,
            },
          });
        }
        return {
          count: await tx.serverMessageReaction.count({
            where: { emoji: input.emoji, messageId: message.id },
          }),
          reacted: !existing,
        };
      });
      void publishChatEvent(ctx.db, {
        change: "updated",
        channelId: message.channelId,
        kind: "server",
        messageId: message.id,
        senderId: message.senderId,
        serverId: input.serverId,
      });
      return { ...result, emoji: input.emoji, messageId: message.id };
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
        select: { id: true, role: true },
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
        !canEditServerMessage(currentUserId, message.senderId, membership.role)
      ) {
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
        messageId: message.id,
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
        messageId: message.id,
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
        messageId: message.id,
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

        if (!canManageServerChannels(membership?.role)) {
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

      if (!canManageServerChannels(membership?.role)) {
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

        if (!canManageServerChannels(membership?.role)) {
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

      if (!canManageServerInvites(membership?.role)) {
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

        if (!membership || !canManageServerMembers(membership.role)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "メンバー権限を変更できるのはサーバー所有者だけです",
          });
        }

        const target = await tx.serverMember.findFirst({
          where: { id: input.memberId, serverId: input.serverId },
          select: { id: true, role: true, userId: true },
        });

        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "メンバーが見つかりません",
          });
        }

        if (
          !canManageServerMember(
            membership.role,
            currentUserId,
            target.userId,
          ) ||
          !canChangeServerMemberRole(membership.role, target.role, input.role)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "自分の権限は変更できません",
          });
        }

        if (input.role === "OWNER") {
          if (!isServerOwner(membership.server.createdById, currentUserId)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "所有権を移譲できるのは現在の所有者だけです",
            });
          }
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

        if (!membership || !canManageServerMembers(membership.role)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "メンバーを退出させられるのはサーバー所有者だけです",
          });
        }

        const target = await tx.serverMember.findFirst({
          where: { id: input.memberId, serverId: input.serverId },
          select: { id: true, role: true, userId: true },
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
          !canManageServerMember(
            membership.role,
            currentUserId,
            target.userId,
          ) ||
          !canRemoveServerMember(membership.role, target.role)
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
