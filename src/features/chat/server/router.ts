import { TRPCError } from "@trpc/server";
import { type MatchingTopic, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import {
  assertNotBlocked,
  getBlockedPeerIds,
} from "~/features/friend/server/blocking";
import { getFriendRequestLockIds } from "~/features/friend/server/friend-request-permissions";
import { canManageDirectMessage } from "~/features/chat/server/direct-message-permissions";
import {
  createMatchingTopicVector,
  getConsentedConversationWindows,
} from "~/features/chat/server/matching-content";
import {
  canShowMatchedUser,
  getMatchingConversationConsentTarget,
  getMatchingRatingTarget,
  hasSettledMatch,
} from "~/features/chat/server/matching-permissions";
import { pickMatchingCandidate } from "~/features/chat/server/matching-ranking";
import { isSameDirectMessage } from "~/features/chat/server/message-idempotency";
import {
  isSearchResultBeforeCursor,
  SEARCH_MESSAGE_KINDS,
  sortSearchResults,
  type SearchMessageResult,
} from "~/features/chat/server/search";
import {
  decodeMessageCursor,
  encodeMessageCursor,
  getMessageCursorWhere,
  MESSAGE_PAGE_SIZE,
  prepareMessagePage,
} from "~/features/chat/message-page";
import {
  getLatestFriendMessage,
  sortFriendsByLatestMessage,
} from "~/features/chat/friend-overview";
import { enforceTRPCRateLimits } from "~/server/api/rate-limit";
import { publishChatEvent } from "~/server/chat-events";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { addProfileImageUrl } from "~/lib/static-image";
import { sendPushNotification } from "~/features/notification/server/push";

const friendIdInput = z.object({
  friendId: z.string().min(1),
});

const conversationInput = friendIdInput.extend({
  cursor: z.string().nullish(),
});

const markConversationReadInput = friendIdInput.extend({
  messageId: z.string().min(1),
});

const messageIdInput = z.object({
  messageId: z.string().min(1),
});

const sendMessageInput = friendIdInput.extend({
  attachmentIds: z.array(z.string().min(1)).max(4).default([]),
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

const searchMessagesInput = z
  .object({
    cursor: z.string().nullish(),
    from: z.date().optional(),
    kinds: z.array(z.enum(SEARCH_MESSAGE_KINDS)).min(1).max(3).optional(),
    limit: z.number().int().min(1).max(50).default(30),
    query: z.string().trim().min(2).max(100).optional(),
    senderUserId: z.string().trim().min(1).max(64).optional(),
    to: z.date().optional(),
  })
  .refine(
    (input) =>
      [input.query, input.senderUserId, input.from, input.to].some(
        (value) => value !== undefined,
      ),
    {
      message: "キーワード、送信者、または日付を指定してください",
    },
  )
  .refine((input) => !input.from || !input.to || input.from <= input.to, {
    message: "開始日は終了日以前にしてください",
  });

const toggleMessageReactionInput = messageIdInput.extend({
  emoji: reactionEmoji,
});

const savedMessagesInput = z.object({
  kind: z.enum(SEARCH_MESSAGE_KINDS).optional(),
  limit: z.number().int().min(1).max(50).default(30),
});

const toggleSavedMessageInput = messageIdInput.extend({
  kind: z.enum(SEARCH_MESSAGE_KINDS),
});

const updateMessageInput = messageIdInput.extend({
  content: sendMessageInput.shape.content,
});

const typingInput = friendIdInput.extend({
  isTyping: z.boolean(),
});

const matchingTopicInput = z.object({
  topic: z.enum(["CASUAL", "GAME", "WORRIES"]),
});

const matchingRatingInput = z.object({
  matchId: z.string().min(1),
  rating: z.enum(["NEGATIVE", "NEUTRAL", "POSITIVE"]),
});

const matchingConversationConsentInput = z.object({
  consent: z.boolean(),
  matchId: z.string().min(1),
});

const matchingHistoryInput = z.object({
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(30).default(20),
  topic: z.enum(["CASUAL", "GAME", "WORRIES"]).optional(),
});

const matchingSafetyConsentInput = z.object({
  consent: z.boolean(),
  matchId: z.string().min(1),
});

const rematchInput = z.object({ matchId: z.string().min(1) });

const matchingRatingValue = {
  NEGATIVE: 0,
  NEUTRAL: 1,
  POSITIVE: 2,
} as const;

const userPreviewSelect = {
  id: true,
  name: true,
  userId: true,
} as const;

const matchingCandidateSelect = {
  ...userPreviewSelect,
  matchingRatingCount: true,
  matchingRatingTotal: true,
} as const;

async function refreshMatchingTopicProfile(
  database: PrismaClient,
  userId: string,
  topic: MatchingTopic,
) {
  const recentResults = await database.matchingResult.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
      topic,
      OR: [{ firstUserId: userId }, { secondUserId: userId }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      createdAt: true,
      firstUserConversationConsent: true,
      firstUserId: true,
      secondUserConversationConsent: true,
      secondUserId: true,
    },
  });
  // ponytail: scan at most 50 match records in memory; move this windowing to
  // SQL only if users regularly exceed that history within 180 days.
  const conversationWindows = getConsentedConversationWindows(
    recentResults,
    userId,
  );

  if (conversationWindows.length === 0) {
    await database.matchingTopicProfile.deleteMany({
      where: { topic, userId },
    });
    return null;
  }

  const messages = await database.directMessage.findMany({
    where: { OR: conversationWindows, senderId: userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { content: true },
  });
  const vector = createMatchingTopicVector(
    messages.map((message) => message.content),
  );

  if (!vector) {
    await database.matchingTopicProfile.deleteMany({
      where: { topic, userId },
    });
    return null;
  }

  await database.matchingTopicProfile.upsert({
    where: { userId_topic: { topic, userId } },
    create: { sampleCount: messages.length, topic, userId, vector },
    update: { sampleCount: messages.length, vector },
  });

  return vector;
}

function addPublicMatchingUserImageUrl(user: {
  id: string;
  matchingRatingCount?: number;
  matchingRatingTotal?: number;
  name: string | null;
  userId: string;
}) {
  return addProfileImageUrl({
    id: user.id,
    name: user.name,
    userId: user.userId,
  });
}

function getSearchDateWhere(from?: Date, to?: Date) {
  return from || to
    ? {
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      }
    : {};
}

function addSearchSenderImage<T extends { sender: { userId: string } }>(
  result: T,
) {
  return { ...result, sender: addProfileImageUrl(result.sender) };
}

export const chatRouter = createTRPCRouter({
  searchMessages: protectedProcedure
    .input(searchMessagesInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceTRPCRateLimits([
        {
          limit: 30,
          scope: "chat:search:user",
          subject: currentUserId,
          windowMs: 60 * 1000,
        },
      ]);

      const kinds = new Set(input.kinds ?? SEARCH_MESSAGE_KINDS);
      const cursor = decodeMessageCursor(input.cursor);
      if (input.cursor && !cursor) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "検索位置が無効です",
        });
      }
      const blocks = await ctx.db.userBlock.findMany({
        where: {
          OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
        },
        select: { blockedId: true, blockerId: true },
      });
      const blockedPeerIds = getBlockedPeerIds(currentUserId, blocks);
      const senderWhere = input.senderUserId
        ? {
            sender: {
              userId: {
                equals: input.senderUserId,
                mode: "insensitive" as const,
              },
            },
          }
        : {};
      const commonWhere = {
        ...(input.query
          ? { content: { contains: input.query, mode: "insensitive" as const } }
          : {}),
        ...getSearchDateWhere(input.from, input.to),
        ...(cursor ? { AND: [getMessageCursorWhere(cursor)] } : {}),
        ...(blockedPeerIds.length > 0
          ? { senderId: { notIn: blockedPeerIds } }
          : {}),
        ...senderWhere,
      };
      const take = input.limit + 1;

      const [directMessages, serverMessages, groupMessages] = await Promise.all(
        [
          kinds.has("DIRECT")
            ? ctx.db.directMessage.findMany({
                where: {
                  ...commonWhere,
                  OR: [
                    {
                      receiverId: {
                        ...(blockedPeerIds.length > 0
                          ? { notIn: blockedPeerIds }
                          : {}),
                      },
                      senderId: currentUserId,
                    },
                    {
                      receiverId: currentUserId,
                      senderId: {
                        ...(blockedPeerIds.length > 0
                          ? { notIn: blockedPeerIds }
                          : {}),
                      },
                    },
                  ],
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take,
                select: {
                  content: true,
                  createdAt: true,
                  id: true,
                  receiverId: true,
                  senderId: true,
                  sender: {
                    select: { id: true, name: true, userId: true },
                  },
                },
              })
            : Promise.resolve([]),
          kinds.has("SERVER")
            ? ctx.db.serverMessage.findMany({
                where: {
                  ...commonWhere,
                  server: { members: { some: { userId: currentUserId } } },
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take,
                select: {
                  channel: { select: { id: true, name: true } },
                  content: true,
                  createdAt: true,
                  id: true,
                  sender: {
                    select: { id: true, name: true, userId: true },
                  },
                  server: { select: { id: true, name: true } },
                },
              })
            : Promise.resolve([]),
          kinds.has("GROUP")
            ? ctx.db.groupMessage.findMany({
                where: {
                  ...commonWhere,
                  group: { members: { some: { userId: currentUserId } } },
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take,
                select: {
                  content: true,
                  createdAt: true,
                  group: { select: { id: true, name: true } },
                  id: true,
                  sender: {
                    select: { id: true, name: true, userId: true },
                  },
                },
              })
            : Promise.resolve([]),
        ],
      );

      const results: SearchMessageResult[] = [
        ...directMessages.map((message) =>
          addSearchSenderImage({
            content: message.content,
            context: {
              friendId:
                message.senderId === currentUserId
                  ? message.receiverId
                  : message.senderId,
            },
            createdAt: message.createdAt,
            id: message.id,
            kind: "DIRECT" as const,
            sender: message.sender,
          }),
        ),
        ...serverMessages.map((message) =>
          addSearchSenderImage({
            content: message.content,
            context: {
              channelId: message.channel?.id,
              channelName: message.channel?.name,
              serverId: message.server.id,
              serverName: message.server.name,
            },
            createdAt: message.createdAt,
            id: message.id,
            kind: "SERVER" as const,
            sender: message.sender,
          }),
        ),
        ...groupMessages.map((message) =>
          addSearchSenderImage({
            content: message.content,
            context: {
              groupId: message.group.id,
              groupName: message.group.name ?? undefined,
            },
            createdAt: message.createdAt,
            id: message.id,
            kind: "GROUP" as const,
            sender: message.sender,
          }),
        ),
      ].filter((result) => isSearchResultBeforeCursor(result, cursor));
      const sortedResults = sortSearchResults(results);
      const items = sortedResults.slice(0, input.limit);
      const nextBoundary =
        sortedResults.length > input.limit ? items.at(-1) : undefined;

      return {
        items,
        nextCursor: nextBoundary
          ? encodeMessageCursor(nextBoundary)
          : undefined,
      };
    }),

  getFriends: protectedProcedure.query(async ({ ctx }) => {
    const currentUserId = ctx.session.user.id;
    const [blocks, friendships, sentPeers, receivedPeers] = await Promise.all([
      ctx.db.userBlock.findMany({
        where: {
          OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
        },
        select: { blockedId: true, blockerId: true },
      }),
      ctx.db.friendship.findMany({
        where: { userId: currentUserId },
        orderBy: { createdAt: "desc" },
        select: { friendId: true, id: true },
      }),
      ctx.db.directMessage.groupBy({
        by: ["receiverId"],
        where: { senderId: currentUserId },
      }),
      ctx.db.directMessage.groupBy({
        by: ["senderId"],
        where: { receiverId: currentUserId },
      }),
    ]);
    const blockedPeerIds = getBlockedPeerIds(currentUserId, blocks);
    const blockedPeerIdSet = new Set(blockedPeerIds);
    const friendshipByFriendId = new Map(
      friendships.map((friendship) => [friendship.friendId, friendship.id]),
    );
    const contactIds = new Set([
      ...friendshipByFriendId.keys(),
      ...sentPeers.map((message) => message.receiverId),
      ...receivedPeers.map((message) => message.senderId),
    ]);
    const contacts = await ctx.db.user.findMany({
      where: { id: { in: [...contactIds] } },
      select: {
        id: true,
        userId: true,
        name: true,
        sentDirectMessages: {
          where: { receiverId: currentUserId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            receiverId: true,
            senderId: true,
          },
        },
        receivedDirectMessages: {
          where: { senderId: currentUserId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            receiverId: true,
            senderId: true,
          },
        },
        _count: {
          select: {
            sentDirectMessages: {
              where: { receiverId: currentUserId, readAt: null },
            },
          },
        },
      },
    });

    const friends = contacts.map((contact) => {
      const { _count, receivedDirectMessages, sentDirectMessages, ...friend } =
        contact;
      const friendshipId = friendshipByFriendId.get(friend.id) ?? null;
      const isBlocked = blockedPeerIdSet.has(friend.id);

      return {
        currentUserId,
        friendshipId,
        friend: addProfileImageUrl(friend),
        isBlocked,
        isFriend: friendshipId !== null,
        lastMessage: isBlocked
          ? null
          : getLatestFriendMessage(
              sentDirectMessages[0],
              receivedDirectMessages[0],
            ),
        unreadCount: isBlocked ? 0 : _count.sentDirectMessages,
      };
    });

    return sortFriendsByLatestMessage(friends);
  }),

  getMatchingStatus: protectedProcedure.query(async ({ ctx }) => {
    const currentUserId = ctx.session.user.id;
    const queue = await ctx.db.matchingQueue.findUnique({
      where: { userId: currentUserId },
      select: { matchedUserId: true, matchingResultId: true, topic: true },
    });

    if (!queue) {
      return { status: "idle" as const };
    }

    if (!queue.matchedUserId) {
      return { status: "waiting" as const, topic: queue.topic };
    }

    const [block, friendship, friend] = await Promise.all([
      ctx.db.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: currentUserId, blockedId: queue.matchedUserId },
            { blockerId: queue.matchedUserId, blockedId: currentUserId },
          ],
        },
        select: { id: true },
      }),
      ctx.db.friendship.findUnique({
        where: {
          userId_friendId: {
            userId: currentUserId,
            friendId: queue.matchedUserId,
          },
        },
        select: { id: true },
      }),
      ctx.db.user.findUnique({
        where: { id: queue.matchedUserId },
        select: userPreviewSelect,
      }),
    ]);

    return friend &&
      canShowMatchedUser({
        isBlocked: Boolean(block),
        isFriend: Boolean(friendship),
      })
      ? {
          friend: addProfileImageUrl(friend),
          matchId: queue.matchingResultId,
          status: "matched" as const,
          topic: queue.topic,
        }
      : { status: "idle" as const };
  }),

  getMatchingHistory: protectedProcedure
    .input(matchingHistoryInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const cursor = decodeMessageCursor(input.cursor);
      if (input.cursor && !cursor) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "履歴の位置が無効です",
        });
      }
      const blocks = await ctx.db.userBlock.findMany({
        where: {
          OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
        },
        select: { blockedId: true, blockerId: true },
      });
      const blockedPeerIds = getBlockedPeerIds(currentUserId, blocks);
      const results = await ctx.db.matchingResult.findMany({
        where: {
          topic: input.topic,
          OR: [
            {
              firstUserId: currentUserId,
              secondUserId: { notIn: blockedPeerIds },
            },
            {
              firstUserId: { notIn: blockedPeerIds },
              secondUserId: currentUserId,
            },
          ],
          ...(cursor ? { AND: [getMessageCursorWhere(cursor)] } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        select: {
          createdAt: true,
          firstUserChatConsentAt: true,
          firstUserConversationConsent: true,
          firstUserId: true,
          firstUserRating: true,
          firstUser: { select: userPreviewSelect },
          id: true,
          rematchRequest: {
            select: {
              expiresAt: true,
              firstUserRequestedAt: true,
              secondUserRequestedAt: true,
              status: true,
            },
          },
          secondUserChatConsentAt: true,
          secondUserConversationConsent: true,
          secondUserId: true,
          secondUserRating: true,
          secondUser: { select: userPreviewSelect },
          topic: true,
        },
      });
      const page = results.slice(0, input.limit);
      const peerIds = page.map((result) =>
        result.firstUserId === currentUserId
          ? result.secondUserId
          : result.firstUserId,
      );
      const friendships = await ctx.db.friendship.findMany({
        where: { friendId: { in: peerIds }, userId: currentUserId },
        select: { friendId: true },
      });
      const friendIds = new Set(friendships.map(({ friendId }) => friendId));

      return {
        matches: page.map((result) => {
          const isFirstUser = result.firstUserId === currentUserId;
          const peer = isFirstUser ? result.secondUser : result.firstUser;
          return {
            canOpenDm: friendIds.has(peer.id),
            canRequestRematch: !friendIds.has(peer.id),
            conversationAnalysisConsent: isFirstUser
              ? result.firstUserConversationConsent
              : result.secondUserConversationConsent,
            createdAt: result.createdAt,
            id: result.id,
            peer: addPublicMatchingUserImageUrl(peer),
            rating: isFirstUser
              ? result.firstUserRating
              : result.secondUserRating,
            rematch: result.rematchRequest,
            safetyConfirmed: Boolean(
              isFirstUser
                ? result.firstUserChatConsentAt
                : result.secondUserChatConsentAt,
            ),
            topic: result.topic,
          };
        }),
        nextCursor:
          results.length > input.limit && page.at(-1)
            ? encodeMessageCursor(page.at(-1)!)
            : undefined,
      };
    }),

  confirmMatchingSafety: protectedProcedure
    .input(matchingSafetyConsentInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const result = await ctx.db.matchingResult.findUnique({
        where: { id: input.matchId },
        select: { firstUserId: true, secondUserId: true },
      });
      if (!result) throw new TRPCError({ code: "NOT_FOUND" });
      const isFirstUser = result.firstUserId === currentUserId;
      if (!isFirstUser && result.secondUserId !== currentUserId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const peerId = isFirstUser ? result.secondUserId : result.firstUserId;
      await assertNotBlocked(ctx.db, currentUserId, peerId);
      await ctx.db.matchingResult.update({
        where: { id: input.matchId },
        data: isFirstUser
          ? { firstUserChatConsentAt: input.consent ? new Date() : null }
          : { secondUserChatConsentAt: input.consent ? new Date() : null },
      });
      return { confirmed: input.consent };
    }),

  requestRematch: protectedProcedure
    .input(rematchInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceTRPCRateLimits([
        {
          limit: 10,
          scope: "chat:rematch:user",
          subject: currentUserId,
          windowMs: 24 * 60 * 60 * 1000,
        },
      ]);
      let matchedPeerId: string | undefined;
      const result = await ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "MatchingResult"
          WHERE "id" = ${input.matchId}
          FOR UPDATE
        `;
        const match = await tx.matchingResult.findUnique({
          where: { id: input.matchId },
          select: {
            firstUserId: true,
            firstUser: { select: userPreviewSelect },
            rematchRequest: true,
            secondUserId: true,
            secondUser: { select: userPreviewSelect },
          },
        });
        if (!match) throw new TRPCError({ code: "NOT_FOUND" });
        const isFirstUser = match.firstUserId === currentUserId;
        if (!isFirstUser && match.secondUserId !== currentUserId) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const peer = isFirstUser ? match.secondUser : match.firstUser;
        await assertNotBlocked(tx, currentUserId, peer.id);
        const friendship = await tx.friendship.findUnique({
          where: {
            userId_friendId: { friendId: peer.id, userId: currentUserId },
          },
          select: { id: true },
        });
        if (friendship) {
          return {
            peer: addPublicMatchingUserImageUrl(peer),
            status: "open_existing" as const,
          };
        }

        const now = new Date();
        const isExpired =
          !match.rematchRequest || match.rematchRequest.expiresAt <= now;
        const firstRequestedAt = isExpired
          ? isFirstUser
            ? now
            : null
          : isFirstUser
            ? now
            : match.rematchRequest?.firstUserRequestedAt;
        const secondRequestedAt = isExpired
          ? isFirstUser
            ? null
            : now
          : isFirstUser
            ? match.rematchRequest?.secondUserRequestedAt
            : now;
        const matched = Boolean(firstRequestedAt && secondRequestedAt);
        await tx.rematchRequest.upsert({
          where: { matchingResultId: input.matchId },
          create: {
            expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            firstUserRequestedAt: firstRequestedAt,
            matchingResultId: input.matchId,
            secondUserRequestedAt: secondRequestedAt,
            status: matched ? "MATCHED" : "PENDING",
          },
          update: {
            expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            firstUserRequestedAt: firstRequestedAt,
            secondUserRequestedAt: secondRequestedAt,
            status: matched ? "MATCHED" : "PENDING",
          },
        });
        if (matched) {
          await tx.friendship.createMany({
            data: [
              { friendId: peer.id, userId: currentUserId },
              { friendId: currentUserId, userId: peer.id },
            ],
            skipDuplicates: true,
          });
          matchedPeerId = peer.id;
        }
        return {
          peer: addPublicMatchingUserImageUrl(peer),
          status: matched ? ("matched" as const) : ("requested" as const),
        };
      });
      if (matchedPeerId) {
        await sendPushNotification(ctx.db, {
          kind: "MATCHING",
          recipientId: matchedPeerId,
          title: "再マッチしました",
          url: "/",
        });
      }
      return result;
    }),

  getPendingMatchFeedback: protectedProcedure.query(async ({ ctx }) => {
    const currentUserId = ctx.session.user.id;
    const result = await ctx.db.matchingResult.findFirst({
      where: {
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        OR: [
          {
            firstUserId: currentUserId,
            OR: [
              { firstUserConversationConsent: null },
              { firstUserRatedAt: null },
            ],
          },
          {
            secondUserId: currentUserId,
            OR: [
              { secondUserConversationConsent: null },
              { secondUserRatedAt: null },
            ],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstUserConversationConsent: true,
        firstUserId: true,
        firstUserRatedAt: true,
        firstUser: { select: userPreviewSelect },
        secondUserConversationConsent: true,
        secondUserRatedAt: true,
        secondUser: { select: userPreviewSelect },
      },
    });

    if (!result) return null;

    const isFirstUser = result.firstUserId === currentUserId;
    const friend = isFirstUser ? result.secondUser : result.firstUser;

    const block = await ctx.db.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: friend.id },
          { blockerId: friend.id, blockedId: currentUserId },
        ],
      },
      select: { id: true },
    });
    if (block) return null;

    return {
      friend: addProfileImageUrl(friend),
      matchId: result.id,
      needsConversationConsent:
        (isFirstUser
          ? result.firstUserConversationConsent
          : result.secondUserConversationConsent) === null,
      needsRating: !(isFirstUser
        ? result.firstUserRatedAt
        : result.secondUserRatedAt),
    };
  }),

  submitMatchRating: protectedProcedure
    .input(matchingRatingInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      await enforceTRPCRateLimits([
        {
          limit: 20,
          scope: "chat:matching-rating:user",
          subject: currentUserId,
          windowMs: 60 * 60 * 1000,
        },
      ]);

      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "MatchingResult"
          WHERE "id" = ${input.matchId}
          FOR UPDATE
        `;
        const result = await tx.matchingResult.findUnique({
          where: { id: input.matchId },
          select: {
            createdAt: true,
            firstUserId: true,
            firstUserRatedAt: true,
            secondUserId: true,
            secondUserRatedAt: true,
          },
        });

        const ratingTarget = result
          ? getMatchingRatingTarget(currentUserId, result)
          : null;
        if (
          !result ||
          !ratingTarget ||
          result.createdAt < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "評価対象のマッチングが見つかりません",
          });
        }

        if (ratingTarget.ratedAt) return { ok: true };

        const block = await tx.userBlock.findFirst({
          where: {
            OR: [
              {
                blockerId: currentUserId,
                blockedId: ratingTarget.targetUserId,
              },
              {
                blockerId: ratingTarget.targetUserId,
                blockedId: currentUserId,
              },
            ],
          },
          select: { id: true },
        });
        if (block) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "評価対象のマッチングが見つかりません",
          });
        }

        await tx.matchingResult.update({
          where: { id: input.matchId },
          data: ratingTarget.isFirstUser
            ? { firstUserRatedAt: new Date(), firstUserRating: input.rating }
            : { secondUserRatedAt: new Date(), secondUserRating: input.rating },
        });
        await tx.user.update({
          where: { id: ratingTarget.targetUserId },
          data: {
            matchingRatingCount: { increment: 1 },
            matchingRatingTotal: {
              increment: matchingRatingValue[input.rating],
            },
          },
        });

        return { ok: true };
      });
    }),

  submitConversationAnalysisConsent: protectedProcedure
    .input(matchingConversationConsentInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      await enforceTRPCRateLimits([
        {
          limit: 20,
          scope: "chat:matching-consent:user",
          subject: currentUserId,
          windowMs: 60 * 60 * 1000,
        },
      ]);

      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "MatchingResult"
          WHERE "id" = ${input.matchId}
          FOR UPDATE
        `;
        const result = await tx.matchingResult.findUnique({
          where: { id: input.matchId },
          select: {
            createdAt: true,
            firstUserConversationConsent: true,
            firstUserId: true,
            secondUserConversationConsent: true,
            secondUserId: true,
          },
        });
        const consentTarget = result
          ? getMatchingConversationConsentTarget(currentUserId, result)
          : null;

        if (
          !result ||
          !consentTarget ||
          result.createdAt < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "同意対象のマッチングが見つかりません",
          });
        }
        if (consentTarget.consent !== null) return { ok: true };

        const block = await tx.userBlock.findFirst({
          where: {
            OR: [
              {
                blockerId: currentUserId,
                blockedId: consentTarget.targetUserId,
              },
              {
                blockerId: consentTarget.targetUserId,
                blockedId: currentUserId,
              },
            ],
          },
          select: { id: true },
        });
        if (block) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "同意対象のマッチングが見つかりません",
          });
        }

        await tx.matchingResult.update({
          where: { id: input.matchId },
          data: consentTarget.isFirstUser
            ? { firstUserConversationConsent: input.consent }
            : { secondUserConversationConsent: input.consent },
        });

        return { ok: true };
      });
    }),

  matchRandom: protectedProcedure
    .input(matchingTopicInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      await enforceTRPCRateLimits([
        {
          limit: 10,
          scope: "chat:matching:user",
          subject: currentUserId,
          windowMs: 60 * 1000,
        },
      ]);

      const [blocks, friendships, currentUserVector] = await Promise.all([
        ctx.db.userBlock.findMany({
          where: {
            OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
          },
          select: { blockedId: true, blockerId: true },
        }),
        ctx.db.friendship.findMany({
          where: { userId: currentUserId },
          select: { friendId: true },
        }),
        refreshMatchingTopicProfile(ctx.db, currentUserId, input.topic),
      ]);
      const excludedUserIds = [
        currentUserId,
        ...getBlockedPeerIds(currentUserId, blocks),
        ...friendships.map((friendship) => friendship.friendId),
      ];

      let newlyMatchedPeerId: string | undefined;
      const result = await ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${currentUserId}))::text AS "lock"
        `;

        const getSettledMatch = async () => {
          const queue = await tx.matchingQueue.findUnique({
            where: { userId: currentUserId },
            select: {
              matchedUserId: true,
              matchingResultId: true,
              topic: true,
            },
          });
          if (!hasSettledMatch(queue)) return null;

          const friend = await tx.user.findUnique({
            where: { id: queue.matchedUserId },
            select: userPreviewSelect,
          });
          return friend
            ? {
                friend: addPublicMatchingUserImageUrl(friend),
                matchId: queue.matchingResultId,
                status: "matched" as const,
                topic: queue.topic,
              }
            : null;
        };

        const settledMatch = await getSettledMatch();
        if (settledMatch) return settledMatch;

        const wait = async () => {
          await tx.$queryRaw`
            SELECT "id"
            FROM "User"
            WHERE "id" = ${currentUserId}
            FOR UPDATE
          `;
          const matchSettledWhileWaiting = await getSettledMatch();
          if (matchSettledWhileWaiting) return matchSettledWhileWaiting;

          await tx.matchingQueue.upsert({
            where: { userId: currentUserId },
            update: {
              matchedUserId: null,
              matchingResultId: null,
              topic: input.topic,
            },
            create: { topic: input.topic, userId: currentUserId },
          });

          return { status: "waiting" as const, topic: input.topic };
        };

        const waitingUsers = await tx.matchingQueue.findMany({
          where: {
            matchedUserId: null,
            topic: input.topic,
            userId: { notIn: excludedUserIds },
          },
          orderBy: { createdAt: "asc" },
          take: 50,
          include: {
            user: {
              select: {
                ...matchingCandidateSelect,
                matchingTopicProfiles: {
                  where: { topic: input.topic },
                  take: 1,
                  select: { vector: true },
                },
              },
            },
          },
        });

        const match = pickMatchingCandidate(waitingUsers, currentUserVector);
        if (!match) {
          return wait();
        }
        const [firstUserId, secondUserId] = getFriendRequestLockIds(
          currentUserId,
          match.userId,
        );
        await tx.$queryRaw`
          SELECT "id"
          FROM "User"
          WHERE "id" IN (${firstUserId}, ${secondUserId})
          ORDER BY "id"
          FOR UPDATE
        `;
        const settledMatchAfterLock = await getSettledMatch();
        if (settledMatchAfterLock) return settledMatchAfterLock;

        await assertNotBlocked(tx, currentUserId, match.userId);

        // ponytail: weighted selection from the oldest 50 keeps this cheap;
        // move ranking to the database if the queue grows materially.
        const claimed = await tx.matchingQueue.updateMany({
          where: { id: match.id, matchedUserId: null },
          data: { matchedUserId: currentUserId },
        });

        if (claimed.count === 0) {
          return wait();
        }

        const matchingResult = await tx.matchingResult.create({
          data: {
            firstUserId,
            secondUserId,
            topic: input.topic,
          },
          select: { id: true },
        });
        await tx.matchingQueue.update({
          where: { id: match.id },
          data: { matchingResultId: matchingResult.id },
        });

        await tx.matchingQueue.upsert({
          where: { userId: currentUserId },
          update: {
            matchedUserId: match.userId,
            matchingResultId: matchingResult.id,
            topic: input.topic,
          },
          create: {
            matchedUserId: match.userId,
            matchingResultId: matchingResult.id,
            topic: input.topic,
            userId: currentUserId,
          },
        });
        await tx.friendship.createMany({
          data: [
            { friendId: match.userId, userId: currentUserId },
            { friendId: currentUserId, userId: match.userId },
          ],
          skipDuplicates: true,
        });
        newlyMatchedPeerId = match.userId;

        return {
          friend: addPublicMatchingUserImageUrl(match.user),
          matchId: matchingResult.id,
          status: "matched" as const,
          topic: input.topic,
        };
      });
      if (newlyMatchedPeerId) {
        await sendPushNotification(ctx.db, {
          kind: "MATCHING",
          recipientId: newlyMatchedPeerId,
          title: "マッチングしました",
          url: "/",
        });
      }
      return result;
    }),

  cancelMatching: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.matchingQueue.deleteMany({
      where: { userId: ctx.session.user.id },
    });

    return { ok: true };
  }),

  getConversation: protectedProcedure
    .input(conversationInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      const [friendship, existingMessage, block, friend] = await Promise.all([
        ctx.db.friendship.findUnique({
          where: {
            userId_friendId: {
              userId: currentUserId,
              friendId: input.friendId,
            },
          },
          select: { id: true },
        }),
        ctx.db.directMessage.findFirst({
          where: {
            OR: [
              { receiverId: currentUserId, senderId: input.friendId },
              { receiverId: input.friendId, senderId: currentUserId },
            ],
          },
          select: { id: true },
        }),
        ctx.db.userBlock.findFirst({
          where: {
            OR: [
              { blockerId: currentUserId, blockedId: input.friendId },
              { blockerId: input.friendId, blockedId: currentUserId },
            ],
          },
          select: { id: true },
        }),
        ctx.db.user.findUnique({
          where: { id: input.friendId },
          select: { id: true, userId: true, name: true },
        }),
      ]);

      if (!friend || (!friendship && !existingMessage)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "この会話は開けません",
        });
      }

      const conversationWhere = {
        OR: [
          {
            receiverId: currentUserId,
            senderId: input.friendId,
          },
          {
            receiverId: input.friendId,
            senderId: currentUserId,
          },
        ],
      };
      const stableCursor = decodeMessageCursor(input.cursor);
      const legacyCursor =
        !block && input.cursor && !stableCursor
          ? await ctx.db.directMessage.findFirst({
              where: { id: input.cursor, ...conversationWhere },
              select: { id: true },
            })
          : null;

      const [currentUser, messages] = await Promise.all([
        ctx.db.user.findUniqueOrThrow({
          where: { id: currentUserId },
          select: { id: true, userId: true, name: true },
        }),
        block
          ? []
          : ctx.db.directMessage.findMany({
              where: {
                ...conversationWhere,
                ...(stableCursor
                  ? { AND: [getMessageCursorWhere(stableCursor)] }
                  : {}),
              },
              cursor: legacyCursor ? { id: legacyCursor.id } : undefined,
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: MESSAGE_PAGE_SIZE + 1,
              select: {
                attachments: {
                  select: {
                    fileName: true,
                    id: true,
                    kind: true,
                    mimeType: true,
                    size: true,
                  },
                },
                id: true,
                content: true,
                createdAt: true,
                readAt: true,
                receiverId: true,
                reactions: {
                  select: { emoji: true, userId: true },
                },
                replyTo: {
                  select: {
                    content: true,
                    id: true,
                    sender: {
                      select: { id: true, name: true, userId: true },
                    },
                  },
                },
                savedBy: {
                  where: { userId: currentUserId },
                  select: { userId: true },
                },
                senderId: true,
              },
            }),
      ]);

      return {
        currentUser: addProfileImageUrl(currentUser),
        currentUserId,
        canSend: Boolean(friendship) && !block,
        friend: addProfileImageUrl(friend),
        ...prepareMessagePage(messages),
      };
    }),

  markConversationRead: protectedProcedure
    .input(markConversationReadInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const message = await ctx.db.directMessage.findFirst({
        where: {
          id: input.messageId,
          OR: [
            { receiverId: currentUserId, senderId: input.friendId },
            { receiverId: input.friendId, senderId: currentUserId },
          ],
        },
        select: { createdAt: true },
      });

      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "会話が見つかりません",
        });
      }

      const result = await ctx.db.directMessage.updateMany({
        where: {
          receiverId: currentUserId,
          senderId: input.friendId,
          readAt: null,
          createdAt: { lte: message.createdAt },
        },
        data: { readAt: new Date() },
      });

      return { count: result.count, readThrough: message.createdAt };
    }),

  setTyping: protectedProcedure
    .input(typingInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceTRPCRateLimits([
        {
          limit: 30,
          scope: "chat:typing:user",
          subject: currentUserId,
          windowMs: 10 * 1000,
        },
      ]);
      const [friendship, currentUser] = await Promise.all([
        ctx.db.friendship.findUnique({
          where: {
            userId_friendId: {
              userId: currentUserId,
              friendId: input.friendId,
            },
          },
          select: { id: true },
        }),
        ctx.db.user.findUniqueOrThrow({
          where: { id: currentUserId },
          select: { name: true, userId: true },
        }),
      ]);

      if (!friendship) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "フレンドにだけ入力状態を送れます",
        });
      }
      await assertNotBlocked(ctx.db, currentUserId, input.friendId);
      const userName = currentUser.name?.trim() ?? currentUser.userId;

      void publishChatEvent(ctx.db, {
        isTyping: input.isTyping,
        kind: "typing",
        senderId: currentUserId,
        userIds: [currentUserId, input.friendId],
        userName,
      });

      return { ok: true };
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

      const content = input.content.trim();
      const [firstUserId, secondUserId] = getFriendRequestLockIds(
        currentUserId,
        input.friendId,
      );
      const message = await ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "User"
          WHERE "id" IN (${firstUserId}, ${secondUserId})
          ORDER BY "id"
          FOR UPDATE
        `;

        const friendship = await tx.friendship.findUnique({
          where: {
            userId_friendId: {
              userId: currentUserId,
              friendId: input.friendId,
            },
          },
          select: { id: true },
        });

        if (!friendship) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "フレンドにだけメッセージを送れます",
          });
        }
        await assertNotBlocked(tx, currentUserId, input.friendId);

        if (input.replyToId) {
          const replyTarget = await tx.directMessage.findFirst({
            where: {
              id: input.replyToId,
              OR: [
                { receiverId: currentUserId, senderId: input.friendId },
                { receiverId: input.friendId, senderId: currentUserId },
              ],
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

        const storedMessage = await tx.directMessage.upsert({
          where: {
            senderId_clientId: {
              clientId: input.clientId,
              senderId: currentUserId,
            },
          },
          create: {
            clientId: input.clientId,
            content,
            receiverId: input.friendId,
            replyToId: input.replyToId,
            senderId: currentUserId,
          },
          update: { clientId: input.clientId },
        });

        if (
          !isSameDirectMessage(storedMessage, {
            content,
            receiverId: input.friendId,
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
          if (attachmentIds.length !== input.attachmentIds.length) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "同じ添付ファイルは一度だけ指定してください",
            });
          }
          const attachments = await tx.messageAttachment.findMany({
            where: {
              groupMessageId: null,
              id: { in: attachmentIds },
              OR: [
                { directMessageId: storedMessage.id },
                {
                  directMessageId: null,
                  expiresAt: { gt: new Date() },
                },
              ],
              serverMessageId: null,
              uploaderId: currentUserId,
            },
            select: { id: true },
          });
          if (attachments.length !== attachmentIds.length) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "添付ファイルが無効か期限切れです",
            });
          }
          await tx.messageAttachment.updateMany({
            where: { directMessageId: null, id: { in: attachmentIds } },
            data: { directMessageId: storedMessage.id, expiresAt: null },
          });
        }

        return storedMessage;
      });

      void publishChatEvent(ctx.db, {
        kind: "direct",
        userIds: [currentUserId, input.friendId],
      });
      await sendPushNotification(ctx.db, {
        body: content,
        kind: "DIRECT_MESSAGE",
        recipientId: input.friendId,
        title: "新着DM",
        url: "/",
      });
      return message;
    }),

  updateMessage: protectedProcedure
    .input(updateMessageInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const message = await ctx.db.directMessage.findUnique({
        where: { id: input.messageId },
        select: { id: true, receiverId: true, senderId: true },
      });

      if (message?.senderId !== currentUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "編集できるメッセージが見つかりません",
        });
      }

      if (
        !canManageDirectMessage({
          currentUserId,
          senderId: message.senderId,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot edit this message",
        });
      }

      const updatedMessage = await ctx.db.directMessage.update({
        where: { id: message.id },
        data: { content: input.content },
        select: { id: true, content: true },
      });

      void publishChatEvent(ctx.db, {
        kind: "direct",
        userIds: [currentUserId, message.receiverId],
      });
      return updatedMessage;
    }),

  deleteMessage: protectedProcedure
    .input(messageIdInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const message = await ctx.db.directMessage.findUnique({
        where: { id: input.messageId },
        select: { id: true, receiverId: true, senderId: true },
      });

      if (message?.senderId !== currentUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "削除できるメッセージが見つかりません",
        });
      }

      if (
        !canManageDirectMessage({
          currentUserId,
          senderId: message.senderId,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete this message",
        });
      }

      await ctx.db.directMessage.delete({ where: { id: message.id } });
      void publishChatEvent(ctx.db, {
        kind: "direct",
        userIds: [currentUserId, message.receiverId],
      });
      return { id: message.id };
    }),

  toggleReaction: protectedProcedure
    .input(toggleMessageReactionInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const message = await ctx.db.directMessage.findFirst({
        where: {
          id: input.messageId,
          OR: [{ receiverId: currentUserId }, { senderId: currentUserId }],
        },
        select: { receiverId: true, senderId: true },
      });
      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "メッセージが見つかりません",
        });
      }
      const peerId =
        message.senderId === currentUserId
          ? message.receiverId
          : message.senderId;
      await assertNotBlocked(ctx.db, currentUserId, peerId);

      const result = await ctx.db.$transaction(async (tx) => {
        const key = {
          messageId_userId_emoji: {
            emoji: input.emoji,
            messageId: input.messageId,
            userId: currentUserId,
          },
        };
        const existing = await tx.directMessageReaction.findUnique({
          where: key,
          select: { messageId: true },
        });
        if (existing) {
          await tx.directMessageReaction.delete({ where: key });
        } else {
          await tx.directMessageReaction.create({
            data: {
              emoji: input.emoji,
              messageId: input.messageId,
              userId: currentUserId,
            },
          });
        }
        const count = await tx.directMessageReaction.count({
          where: { emoji: input.emoji, messageId: input.messageId },
        });
        return { count, reacted: !existing };
      });

      void publishChatEvent(ctx.db, {
        kind: "direct",
        userIds: [currentUserId, peerId],
      });
      return { ...result, emoji: input.emoji, messageId: input.messageId };
    }),

  toggleSavedMessage: protectedProcedure
    .input(toggleSavedMessageInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;

      if (input.kind === "DIRECT") {
        const message = await ctx.db.directMessage.findFirst({
          where: {
            id: input.messageId,
            OR: [{ receiverId: currentUserId }, { senderId: currentUserId }],
          },
          select: { receiverId: true, senderId: true },
        });
        if (!message) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await assertNotBlocked(
          ctx.db,
          currentUserId,
          message.senderId === currentUserId
            ? message.receiverId
            : message.senderId,
        );
        const key = {
          userId_messageId: {
            messageId: input.messageId,
            userId: currentUserId,
          },
        };
        const existing = await ctx.db.savedDirectMessage.findUnique({
          where: key,
          select: { messageId: true },
        });
        if (existing) await ctx.db.savedDirectMessage.delete({ where: key });
        else {
          await ctx.db.savedDirectMessage.create({
            data: { messageId: input.messageId, userId: currentUserId },
          });
        }
        return { saved: !existing };
      }

      if (input.kind === "SERVER") {
        const message = await ctx.db.serverMessage.findFirst({
          where: {
            id: input.messageId,
            server: { members: { some: { userId: currentUserId } } },
          },
          select: { id: true, senderId: true },
        });
        if (!message) throw new TRPCError({ code: "NOT_FOUND" });
        await assertNotBlocked(ctx.db, currentUserId, message.senderId);
        const key = {
          userId_messageId: {
            messageId: input.messageId,
            userId: currentUserId,
          },
        };
        const existing = await ctx.db.savedServerMessage.findUnique({
          where: key,
          select: { messageId: true },
        });
        if (existing) await ctx.db.savedServerMessage.delete({ where: key });
        else {
          await ctx.db.savedServerMessage.create({
            data: { messageId: input.messageId, userId: currentUserId },
          });
        }
        return { saved: !existing };
      }

      const message = await ctx.db.groupMessage.findFirst({
        where: {
          group: { members: { some: { userId: currentUserId } } },
          id: input.messageId,
        },
        select: { id: true, senderId: true },
      });
      if (!message) throw new TRPCError({ code: "NOT_FOUND" });
      await assertNotBlocked(ctx.db, currentUserId, message.senderId);
      const key = {
        userId_messageId: { messageId: input.messageId, userId: currentUserId },
      };
      const existing = await ctx.db.savedGroupMessage.findUnique({
        where: key,
        select: { messageId: true },
      });
      if (existing) await ctx.db.savedGroupMessage.delete({ where: key });
      else {
        await ctx.db.savedGroupMessage.create({
          data: { messageId: input.messageId, userId: currentUserId },
        });
      }
      return { saved: !existing };
    }),

  getSavedMessages: protectedProcedure
    .input(savedMessagesInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const kinds = new Set(input.kind ? [input.kind] : SEARCH_MESSAGE_KINDS);
      const blocks = await ctx.db.userBlock.findMany({
        where: {
          OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
        },
        select: { blockedId: true, blockerId: true },
      });
      const blockedPeerIds = new Set(getBlockedPeerIds(currentUserId, blocks));
      const [direct, server, group] = await Promise.all([
        kinds.has("DIRECT")
          ? ctx.db.savedDirectMessage.findMany({
              where: {
                userId: currentUserId,
                message: {
                  OR: [
                    { receiverId: currentUserId },
                    { senderId: currentUserId },
                  ],
                },
              },
              orderBy: { createdAt: "desc" },
              take: input.limit,
              include: {
                message: {
                  include: {
                    receiver: { select: { id: true } },
                    sender: { select: { id: true, name: true, userId: true } },
                  },
                },
              },
            })
          : Promise.resolve([]),
        kinds.has("SERVER")
          ? ctx.db.savedServerMessage.findMany({
              where: {
                userId: currentUserId,
                message: {
                  senderId: { notIn: [...blockedPeerIds] },
                  server: { members: { some: { userId: currentUserId } } },
                },
              },
              orderBy: { createdAt: "desc" },
              take: input.limit,
              include: {
                message: {
                  include: {
                    channel: { select: { id: true, name: true } },
                    sender: { select: { id: true, name: true, userId: true } },
                    server: { select: { id: true, name: true } },
                  },
                },
              },
            })
          : Promise.resolve([]),
        kinds.has("GROUP")
          ? ctx.db.savedGroupMessage.findMany({
              where: {
                userId: currentUserId,
                message: {
                  senderId: { notIn: [...blockedPeerIds] },
                  group: { members: { some: { userId: currentUserId } } },
                },
              },
              orderBy: { createdAt: "desc" },
              take: input.limit,
              include: {
                message: {
                  include: {
                    group: { select: { id: true, name: true } },
                    sender: { select: { id: true, name: true, userId: true } },
                  },
                },
              },
            })
          : Promise.resolve([]),
      ]);

      const items = [
        ...direct
          .filter(({ message }) => {
            const peerId =
              message.senderId === currentUserId
                ? message.receiverId
                : message.senderId;
            return !blockedPeerIds.has(peerId);
          })
          .map(({ createdAt: savedAt, message }) => ({
            content: message.content,
            context: {
              friendId:
                message.senderId === currentUserId
                  ? message.receiverId
                  : message.senderId,
            },
            createdAt: message.createdAt,
            id: message.id,
            kind: "DIRECT" as const,
            savedAt,
            sender: addProfileImageUrl(message.sender),
          })),
        ...server
          .filter(({ message }) => !blockedPeerIds.has(message.senderId))
          .map(({ createdAt: savedAt, message }) => ({
            content: message.content,
            context: {
              channelId: message.channel?.id,
              channelName: message.channel?.name,
              serverId: message.server.id,
              serverName: message.server.name,
            },
            createdAt: message.createdAt,
            id: message.id,
            kind: "SERVER" as const,
            savedAt,
            sender: addProfileImageUrl(message.sender),
          })),
        ...group
          .filter(({ message }) => !blockedPeerIds.has(message.senderId))
          .map(({ createdAt: savedAt, message }) => ({
            content: message.content,
            context: {
              groupId: message.group.id,
              groupName: message.group.name ?? undefined,
            },
            createdAt: message.createdAt,
            id: message.id,
            kind: "GROUP" as const,
            savedAt,
            sender: addProfileImageUrl(message.sender),
          })),
      ]
        .sort(
          (left, right) =>
            right.savedAt.getTime() - left.savedAt.getTime() ||
            right.id.localeCompare(left.id),
        )
        .slice(0, input.limit);

      return { items };
    }),
});
