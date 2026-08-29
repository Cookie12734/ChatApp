import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  hasValidP256dhLength,
  hasValidPushAuthLength,
  hasValidQuietHoursPair,
  isValidPushEndpoint,
} from "~/features/notification/server/notification-policy";
import { enforceTRPCRateLimits } from "~/server/api/rate-limit";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getPushConfiguration } from "~/features/notification/server/push";

const notificationSettingsSelect = {
  directMessages: true,
  friendRequests: true,
  groupMessages: true,
  matching: true,
  mentions: true,
  quietHoursEnd: true,
  quietHoursStart: true,
  showMessagePreview: true,
  timeZone: true,
} as const;

const settingsInput = z
  .object({
    directMessages: z.boolean().optional(),
    friendRequests: z.boolean().optional(),
    groupMessages: z.boolean().optional(),
    matching: z.boolean().optional(),
    mentions: z.boolean().optional(),
    quietHoursEnd: z.number().nullable().optional(),
    quietHoursStart: z.number().nullable().optional(),
    showMessagePreview: z.boolean().optional(),
    timeZone: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict()
  .refine(
    ({ quietHoursStart, quietHoursEnd }) =>
      hasValidQuietHoursPair(quietHoursStart, quietHoursEnd),
    {
      message:
        "通知停止時間は開始と終了を両方nullにするか、0から1439の整数で両方指定してください",
      path: ["quietHoursStart"],
    },
  );

const endpointSchema = z
  .string()
  .trim()
  .refine(isValidPushEndpoint, "HTTPSのプッシュ通知URLを指定してください");

const pushSubscriptionInput = z
  .object({
    auth: z
      .string()
      .trim()
      .refine(hasValidPushAuthLength, "authキーの長さが不正です"),
    endpoint: endpointSchema,
    expirationTime: z
      .number()
      .int()
      .min(0)
      .max(8_640_000_000_000_000)
      .nullable()
      .optional(),
    p256dh: z
      .string()
      .trim()
      .refine(hasValidP256dhLength, "p256dhキーの長さが不正です"),
  })
  .strict();

const unsubscribeInput = z.object({ endpoint: endpointSchema }).strict();

function isUniqueConstraintError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002"
  );
}

function endpointConflict() {
  return new TRPCError({
    code: "CONFLICT",
    message: "このプッシュ通知URLは別のユーザーが使用しています",
  });
}

export const notificationRouter = createTRPCRouter({
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const pushConfiguration = getPushConfiguration();
    const settings = await ctx.db.notificationPreference.findUnique({
      where: { userId: ctx.session.user.id },
      select: notificationSettingsSelect,
    });

    return {
      ...(settings ?? DEFAULT_NOTIFICATION_SETTINGS),
      pushConfigured: Boolean(pushConfiguration),
      vapidPublicKey: pushConfiguration?.publicKey,
    };
  }),

  updateSettings: protectedProcedure
    .input(settingsInput)
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.db.notificationPreference.upsert({
        where: { userId: ctx.session.user.id },
        create: {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...input,
          userId: ctx.session.user.id,
        },
        update: input,
        select: notificationSettingsSelect,
      });

      const pushConfiguration = getPushConfiguration();
      return {
        ...settings,
        pushConfigured: Boolean(pushConfiguration),
        vapidPublicKey: pushConfiguration?.publicKey,
      };
    }),

  subscribePush: protectedProcedure
    .input(pushSubscriptionInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await enforceTRPCRateLimits([
        {
          limit: 10,
          scope: "notification:push-subscribe:user",
          subject: userId,
          windowMs: 60 * 60 * 1_000,
        },
      ]);

      const existing = await ctx.db.pushSubscription.findUnique({
        where: { endpoint: input.endpoint },
        select: { id: true, userId: true },
      });

      if (existing && existing.userId !== userId) throw endpointConflict();

      const data = {
        auth: input.auth,
        expirationTime:
          input.expirationTime == null ? null : new Date(input.expirationTime),
        lastUsedAt: new Date(),
        p256dh: input.p256dh,
      };

      try {
        if (existing) {
          await ctx.db.pushSubscription.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await ctx.db.pushSubscription.create({
            data: { ...data, endpoint: input.endpoint, userId },
          });
        }
      } catch (error) {
        if (isUniqueConstraintError(error)) throw endpointConflict();
        throw error;
      }

      return { subscribed: true };
    }),

  unsubscribePush: protectedProcedure
    .input(unsubscribeInput)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.pushSubscription.deleteMany({
        where: {
          endpoint: input.endpoint,
          userId: ctx.session.user.id,
        },
      });

      return { unsubscribed: result.count === 1 };
    }),
});
