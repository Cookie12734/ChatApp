import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  decodeMessageCursor,
  getMessageCursorWhere,
  MESSAGE_PAGE_SIZE,
  prepareMessagePage,
} from "~/features/chat/message-page";
import {
  getGroupInviteIssue,
  isSameGroupMessage,
  type GroupInviteIssue,
} from "~/features/group/server/group-policy";
import { addProfileImageUrl } from "~/lib/static-image";
import {
  assertNotBlocked,
  getBlockedPeerIds,
} from "~/features/friend/server/blocking";
import { sendPushNotification } from "~/features/notification/server/push";
import { enforceTRPCRateLimits } from "~/server/api/rate-limit";
import { publishChatEvent } from "~/server/chat-events";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const groupIdInput = z.object({ groupId: z.string().min(1) });

const groupNameInput = z
  .string()
  .trim()
  .max(50, "グループ名は50文字以内で入力してください")
  .transform((name) => name || null);

const uniqueMemberIds = (minimum: number) =>
  z
    .array(z.string().min(1))
    .min(minimum, `メンバーを${minimum}人以上選択してください`)
    .max(9, "一度に選択できるメンバーは9人までです")
    .refine((memberIds) => new Set(memberIds).size === memberIds.length, {
      message: "同じユーザーを複数回選択できません",
    });

const createInput = z.object({
  memberIds: uniqueMemberIds(2),
  name: groupNameInput.optional(),
});

const conversationInput = groupIdInput.extend({
  cursor: z.string().nullish(),
});

const sendMessageInput = groupIdInput.extend({
  attachmentIds: z.array(z.string().min(1)).max(4).default([]),
  clientId: z.string().uuid(),
  content: z
    .string()
    .trim()
    .min(1, "メッセージを入力してください")
    .max(1000, "メッセージは1000文字以内で入力してください"),
  replyToId: z.string().min(1).nullish(),
});

const markReadInput = groupIdInput.extend({
  messageId: z.string().min(1),
});

const updateInput = groupIdInput.extend({ name: groupNameInput });

const addMembersInput = groupIdInput.extend({
  memberIds: uniqueMemberIds(1),
});

const memberInput = groupIdInput.extend({
  memberId: z.string().min(1),
});

const reactionEmoji = z.enum([
  "\u{1F44D}",
  "\u{2764}\u{FE0F}",
  "\u{1F602}",
  "\u{1F389}",
  "\u{1F62E}",
  "\u{1F64F}",
]);

const reactionInput = markReadInput.extend({
  emoji: reactionEmoji,
});

type MembershipReader = {
  groupConversationMember: {
    findUnique(args: {
      select: { readAt: true; role: true };
      where: {
        groupId_userId: { groupId: string; userId: string };
      };
    }): Promise<{ readAt: Date; role: "MEMBER" | "OWNER" } | null>;
  };
};

const memberSelect = {
  createdAt: true,
  readAt: true,
  role: true,
  user: { select: { id: true, name: true, userId: true } },
} as const;

async function enforceGroupRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowMs = 60 * 1000,
) {
  await enforceTRPCRateLimits([
    {
      limit,
      scope: `group:${action}:user`,
      subject: userId,
      windowMs,
    },
  ]);
}

async function requireGroupMembership(
  database: MembershipReader,
  groupId: string,
  userId: string,
) {
  const membership = await database.groupConversationMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { readAt: true, role: true },
  });

  if (!membership) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "グループが見つからないか、参加していません",
    });
  }

  return membership;
}

async function requireGroupOwner(
  database: MembershipReader,
  groupId: string,
  userId: string,
) {
  const membership = await requireGroupMembership(database, groupId, userId);
  if (membership.role !== "OWNER") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "この操作はグループのオーナーのみ実行できます",
    });
  }
  return membership;
}

function assertValidGroupInvite(issue: GroupInviteIssue | undefined) {
  if (!issue) return;

  const errors: Record<
    GroupInviteIssue,
    { code: "BAD_REQUEST" | "FORBIDDEN"; message: string }
  > = {
    ALREADY_MEMBER: {
      code: "BAD_REQUEST",
      message: "すでに参加しているユーザーは追加できません",
    },
    BLOCKED: {
      code: "FORBIDDEN",
      message: "ブロック関係にあるユーザーを同じグループに追加できません",
    },
    DUPLICATE: {
      code: "BAD_REQUEST",
      message: "同じユーザーを複数回選択できません",
    },
    NOT_FRIEND: {
      code: "FORBIDDEN",
      message: "招待できるのはフレンドのみです",
    },
    TOO_MANY: {
      code: "BAD_REQUEST",
      message: "グループは最大10人です",
    },
  };

  throw new TRPCError(errors[issue]);
}

function addMemberImages<T extends { user: { userId: string } }>(member: T) {
  return { ...member, user: addProfileImageUrl(member.user) };
}

export const groupRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const currentUserId = ctx.session.user.id;
    await enforceGroupRateLimit(currentUserId, "list", 120);

    const groups = await ctx.db.groupConversation.findMany({
      where: { members: { some: { userId: currentUserId } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        createdAt: true,
        createdById: true,
        id: true,
        name: true,
        updatedAt: true,
        members: {
          orderBy: { createdAt: "asc" },
          select: memberSelect,
        },
        messages: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            content: true,
            createdAt: true,
            id: true,
            senderId: true,
          },
        },
      },
    });

    return {
      groups: groups.map(({ members, messages, ...group }) => {
        const membersWithImages = members.map(addMemberImages);
        return {
          ...group,
          lastMessage: messages[0] ?? null,
          members: membersWithImages,
          myMembership: membersWithImages.find(
            (member) => member.user.id === currentUserId,
          ),
        };
      }),
    };
  }),

  create: protectedProcedure
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceGroupRateLimit(currentUserId, "create", 5, 60 * 60 * 1000);

      const result = await ctx.db.$transaction(async (tx) => {
        const resultingMemberIds = [currentUserId, ...input.memberIds];
        const [friendships, blocks] = await Promise.all([
          tx.friendship.findMany({
            where: {
              friendId: { in: input.memberIds },
              userId: currentUserId,
            },
            select: { friendId: true },
          }),
          tx.userBlock.findMany({
            where: {
              blockedId: { in: resultingMemberIds },
              blockerId: { in: resultingMemberIds },
            },
            select: { blockedId: true, blockerId: true },
          }),
        ]);

        assertValidGroupInvite(
          getGroupInviteIssue({
            blockEdges: blocks,
            candidateIds: input.memberIds,
            existingMemberIds: [currentUserId],
            friendIds: friendships.map((friendship) => friendship.friendId),
          }),
        );

        const group = await tx.groupConversation.create({
          data: {
            createdById: currentUserId,
            name: input.name ?? null,
            members: {
              create: [
                { role: "OWNER", userId: currentUserId },
                ...input.memberIds.map((userId) => ({ userId })),
              ],
            },
          },
          select: {
            createdAt: true,
            createdById: true,
            id: true,
            name: true,
            updatedAt: true,
            members: {
              orderBy: { createdAt: "asc" },
              select: memberSelect,
            },
          },
        });

        return { ...group, members: group.members.map(addMemberImages) };
      });
      return result;
    }),

  getConversation: protectedProcedure
    .input(conversationInput)
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceGroupRateLimit(currentUserId, "conversation", 120);
      const membership = await requireGroupMembership(
        ctx.db,
        input.groupId,
        currentUserId,
      );
      const blocks = await ctx.db.userBlock.findMany({
        where: {
          OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
        },
        select: { blockedId: true, blockerId: true },
      });
      const blockedPeerIds = getBlockedPeerIds(currentUserId, blocks);
      const cursor = decodeMessageCursor(input.cursor);
      if (input.cursor && !cursor) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "メッセージのカーソルが不正です",
        });
      }

      const [currentUser, group, messages] = await Promise.all([
        ctx.db.user.findUniqueOrThrow({
          where: { id: currentUserId },
          select: { id: true, name: true, userId: true },
        }),
        ctx.db.groupConversation.findUnique({
          where: { id: input.groupId },
          select: {
            createdAt: true,
            createdById: true,
            id: true,
            name: true,
            updatedAt: true,
            members: {
              orderBy: { createdAt: "asc" },
              select: memberSelect,
            },
          },
        }),
        ctx.db.groupMessage.findMany({
          where: {
            groupId: input.groupId,
            ...(blockedPeerIds.length > 0
              ? { senderId: { notIn: blockedPeerIds } }
              : {}),
            ...(cursor ? { AND: [getMessageCursorWhere(cursor)] } : {}),
          },
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
            clientId: true,
            content: true,
            createdAt: true,
            groupId: true,
            id: true,
            replyToId: true,
            senderId: true,
            sender: { select: { id: true, name: true, userId: true } },
            replyTo: {
              select: {
                content: true,
                createdAt: true,
                id: true,
                sender: {
                  select: { id: true, name: true, userId: true },
                },
                senderId: true,
              },
            },
            reactions: {
              orderBy: [{ emoji: "asc" }, { createdAt: "asc" }],
              select: { createdAt: true, emoji: true, userId: true },
            },
            savedBy: {
              where: { userId: currentUserId },
              select: { userId: true },
            },
          },
        }),
      ]);

      if (!group) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "グループが見つかりません",
        });
      }

      const messagePage = messages.map(
        ({ replyTo, savedBy, sender, ...message }) => ({
          ...message,
          isSaved: savedBy.length > 0,
          replyTo: replyTo
            ? { ...replyTo, sender: addProfileImageUrl(replyTo.sender) }
            : null,
          sender: addProfileImageUrl(sender),
        }),
      );

      return {
        currentUser: addProfileImageUrl(currentUser),
        group: { ...group, members: group.members.map(addMemberImages) },
        membership,
        ...prepareMessagePage(messagePage),
      };
    }),

  sendMessage: protectedProcedure
    .input(sendMessageInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceGroupRateLimit(currentUserId, "message", 30, 10 * 1000);
      const content = input.content.trim();
      const replyToId = input.replyToId ?? null;

      const result = await ctx.db.$transaction(async (tx) => {
        await requireGroupMembership(tx, input.groupId, currentUserId);
        const groupMembers = await tx.groupConversationMember.findMany({
          where: { groupId: input.groupId, userId: { not: currentUserId } },
          select: { userId: true },
        });
        await Promise.all(
          groupMembers.map(({ userId }) =>
            assertNotBlocked(tx, currentUserId, userId),
          ),
        );
        if (replyToId) {
          const replyTarget = await tx.groupMessage.findFirst({
            where: { groupId: input.groupId, id: replyToId },
            select: { id: true },
          });
          if (!replyTarget) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "返信先のメッセージが見つかりません",
            });
          }
        }

        const message = await tx.groupMessage.upsert({
          where: {
            senderId_clientId: {
              clientId: input.clientId,
              senderId: currentUserId,
            },
          },
          create: {
            clientId: input.clientId,
            content,
            groupId: input.groupId,
            replyToId,
            senderId: currentUserId,
          },
          update: { clientId: input.clientId },
        });

        if (
          !isSameGroupMessage(message, {
            content,
            groupId: input.groupId,
            replyToId,
          })
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
              id: { in: attachmentIds },
              OR: [
                { groupMessageId: message.id },
                { expiresAt: { gt: new Date() }, groupMessageId: null },
              ],
              serverMessageId: null,
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
            where: { groupMessageId: null, id: { in: attachmentIds } },
            data: { expiresAt: null, groupMessageId: message.id },
          });
        }

        await tx.groupConversation.updateMany({
          where: { id: input.groupId, updatedAt: { lt: message.createdAt } },
          data: { updatedAt: message.createdAt },
        });
        await tx.groupConversationMember.updateMany({
          where: {
            groupId: input.groupId,
            readAt: { lt: message.createdAt },
            userId: currentUserId,
          },
          data: { readAt: message.createdAt },
        });
        return {
          message,
          recipientIds: groupMembers.map(({ userId }) => userId),
        };
      });
      void publishChatEvent(ctx.db, {
        groupId: input.groupId,
        kind: "group",
        userIds: [currentUserId, ...result.recipientIds],
      });
      await Promise.all(
        result.recipientIds.map((recipientId) =>
          sendPushNotification(ctx.db, {
            body: content,
            kind: "GROUP_MESSAGE",
            recipientId,
            title: "グループDM",
            url: "/",
          }),
        ),
      );
      return result.message;
    }),

  markRead: protectedProcedure
    .input(markReadInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceGroupRateLimit(currentUserId, "mark-read", 120);
      await requireGroupMembership(ctx.db, input.groupId, currentUserId);
      const message = await ctx.db.groupMessage.findFirst({
        where: { groupId: input.groupId, id: input.messageId },
        select: { createdAt: true },
      });
      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "メッセージが見つかりません",
        });
      }

      await ctx.db.groupConversationMember.updateMany({
        where: {
          groupId: input.groupId,
          readAt: { lt: message.createdAt },
          userId: currentUserId,
        },
        data: { readAt: message.createdAt },
      });
      return { ok: true, readThrough: message.createdAt };
    }),

  update: protectedProcedure
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceGroupRateLimit(currentUserId, "update", 20);
      await requireGroupOwner(ctx.db, input.groupId, currentUserId);

      return ctx.db.groupConversation.update({
        where: { id: input.groupId },
        data: { name: input.name },
        select: {
          createdAt: true,
          createdById: true,
          id: true,
          name: true,
          updatedAt: true,
        },
      });
    }),

  addMembers: protectedProcedure
    .input(addMembersInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceGroupRateLimit(currentUserId, "add-members", 20);

      return ctx.db.$transaction(async (tx) => {
        const lockedGroup = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "GroupConversation"
          WHERE "id" = ${input.groupId}
          FOR UPDATE
        `;
        if (lockedGroup.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "グループが見つかりません",
          });
        }
        await requireGroupOwner(tx, input.groupId, currentUserId);

        const existingMembers = await tx.groupConversationMember.findMany({
          where: { groupId: input.groupId },
          select: { userId: true },
        });
        const existingMemberIds = existingMembers.map(
          (member) => member.userId,
        );
        const resultingMemberIds = [...existingMemberIds, ...input.memberIds];
        const [friendships, blocks] = await Promise.all([
          tx.friendship.findMany({
            where: {
              friendId: { in: input.memberIds },
              userId: currentUserId,
            },
            select: { friendId: true },
          }),
          tx.userBlock.findMany({
            where: {
              blockedId: { in: resultingMemberIds },
              blockerId: { in: resultingMemberIds },
            },
            select: { blockedId: true, blockerId: true },
          }),
        ]);
        assertValidGroupInvite(
          getGroupInviteIssue({
            blockEdges: blocks,
            candidateIds: input.memberIds,
            existingMemberIds,
            friendIds: friendships.map((friendship) => friendship.friendId),
          }),
        );

        await tx.groupConversationMember.createMany({
          data: input.memberIds.map((userId) => ({
            groupId: input.groupId,
            userId,
          })),
        });
        await tx.groupConversation.update({
          where: { id: input.groupId },
          data: { updatedAt: new Date() },
        });
        const members = await tx.groupConversationMember.findMany({
          where: { groupId: input.groupId },
          orderBy: { createdAt: "asc" },
          select: memberSelect,
        });
        return { members: members.map(addMemberImages) };
      });
    }),

  removeMember: protectedProcedure
    .input(memberInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceGroupRateLimit(currentUserId, "remove-member", 20);

      return ctx.db.$transaction(async (tx) => {
        await requireGroupOwner(tx, input.groupId, currentUserId);
        const member = await tx.groupConversationMember.findUnique({
          where: {
            groupId_userId: {
              groupId: input.groupId,
              userId: input.memberId,
            },
          },
          select: { role: true },
        });
        if (!member) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "メンバーが見つかりません",
          });
        }
        if (member.role === "OWNER") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "オーナーをグループから削除できません",
          });
        }

        await tx.groupConversationMember.delete({
          where: {
            groupId_userId: {
              groupId: input.groupId,
              userId: input.memberId,
            },
          },
        });
        await tx.groupConversation.update({
          where: { id: input.groupId },
          data: { updatedAt: new Date() },
        });
        return { ok: true };
      });
    }),

  leave: protectedProcedure
    .input(groupIdInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceGroupRateLimit(currentUserId, "leave", 20);

      return ctx.db.$transaction(async (tx) => {
        const membership = await requireGroupMembership(
          tx,
          input.groupId,
          currentUserId,
        );
        if (membership.role === "OWNER") {
          const memberCount = await tx.groupConversationMember.count({
            where: { groupId: input.groupId },
          });
          if (memberCount > 1) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "他のメンバーがいる間、オーナーは退出できません",
            });
          }
          await tx.groupConversation.delete({ where: { id: input.groupId } });
          return { deleted: true, ok: true };
        }

        await tx.groupConversationMember.delete({
          where: {
            groupId_userId: {
              groupId: input.groupId,
              userId: currentUserId,
            },
          },
        });
        await tx.groupConversation.update({
          where: { id: input.groupId },
          data: { updatedAt: new Date() },
        });
        return { deleted: false, ok: true };
      });
    }),

  toggleReaction: protectedProcedure
    .input(reactionInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceGroupRateLimit(currentUserId, "reaction", 60);

      return ctx.db.$transaction(async (tx) => {
        await requireGroupMembership(tx, input.groupId, currentUserId);
        const message = await tx.groupMessage.findFirst({
          where: { groupId: input.groupId, id: input.messageId },
          select: { id: true, senderId: true },
        });
        if (!message) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "メッセージが見つかりません",
          });
        }
        await assertNotBlocked(tx, currentUserId, message.senderId);

        const reaction = await tx.groupMessageReaction.findUnique({
          where: {
            messageId_userId_emoji: {
              emoji: input.emoji,
              messageId: message.id,
              userId: currentUserId,
            },
          },
          select: { messageId: true },
        });
        if (reaction) {
          await tx.groupMessageReaction.delete({
            where: {
              messageId_userId_emoji: {
                emoji: input.emoji,
                messageId: message.id,
                userId: currentUserId,
              },
            },
          });
        } else {
          await tx.groupMessageReaction.create({
            data: {
              emoji: input.emoji,
              messageId: message.id,
              userId: currentUserId,
            },
          });
        }
        const count = await tx.groupMessageReaction.count({
          where: { emoji: input.emoji, messageId: message.id },
        });
        return {
          count,
          emoji: input.emoji,
          messageId: message.id,
          reacted: !reaction,
        };
      });
    }),

  toggleSaved: protectedProcedure
    .input(markReadInput)
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      await enforceGroupRateLimit(currentUserId, "saved", 60);

      return ctx.db.$transaction(async (tx) => {
        await requireGroupMembership(tx, input.groupId, currentUserId);
        const message = await tx.groupMessage.findFirst({
          where: { groupId: input.groupId, id: input.messageId },
          select: { id: true, senderId: true },
        });
        if (!message) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "メッセージが見つかりません",
          });
        }
        await assertNotBlocked(tx, currentUserId, message.senderId);

        const saved = await tx.savedGroupMessage.findUnique({
          where: {
            userId_messageId: {
              messageId: message.id,
              userId: currentUserId,
            },
          },
          select: { messageId: true },
        });
        if (saved) {
          await tx.savedGroupMessage.delete({
            where: {
              userId_messageId: {
                messageId: message.id,
                userId: currentUserId,
              },
            },
          });
          return { saved: false };
        }

        await tx.savedGroupMessage.create({
          data: { messageId: message.id, userId: currentUserId },
        });
        return { saved: true };
      });
    }),
});
