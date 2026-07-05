import { z } from "zod";

import { presenceStatuses } from "~/features/profile/presence";
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
});
