import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const profileInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "名前を入力してください")
    .max(50, "名前は50文字以内で入力してください"),
  image: z.string().trim().max(500).optional(),
  bio: z
    .string()
    .trim()
    .max(160, "自己紹介は160文字以内で入力してください")
    .optional(),
});

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
          image: input.image ? input.image.trim() : null,
          bio: input.bio?.trim() || null,
        },
        select: {
          id: true,
          userId: true,
          name: true,
          image: true,
          bio: true,
        },
      });
    }),
});
