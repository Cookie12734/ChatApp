import type { PrismaClient } from "@prisma/client";
import webPush from "web-push";

import { env } from "~/env";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getMinutesInTimeZone,
  isNotificationKindEnabled,
  isWithinQuietHours,
  type PushNotificationKind,
} from "~/features/notification/server/notification-policy";

export function getPushConfiguration() {
  const subject = env.VAPID_SUBJECT;
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  return subject && publicKey && privateKey
    ? { privateKey, publicKey, subject }
    : undefined;
}

function getPushStatusCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return undefined;
}

export async function sendPushNotification(
  database: Pick<PrismaClient, "notificationPreference" | "pushSubscription">,
  input: {
    body?: string;
    kind: PushNotificationKind;
    recipientId: string;
    title?: string;
    url?: string;
  },
) {
  const configuration = getPushConfiguration();
  if (!configuration) return { delivered: 0 };

  const [storedSettings, subscriptions] = await Promise.all([
    database.notificationPreference.findUnique({
      where: { userId: input.recipientId },
    }),
    database.pushSubscription.findMany({
      where: { userId: input.recipientId },
    }),
  ]);
  const settings = storedSettings ?? DEFAULT_NOTIFICATION_SETTINGS;
  if (!isNotificationKindEnabled(settings, input.kind)) {
    return { delivered: 0 };
  }
  const minutes = getMinutesInTimeZone(new Date(), settings.timeZone);
  if (
    isWithinQuietHours(
      minutes,
      settings.quietHoursStart,
      settings.quietHoursEnd,
    )
  ) {
    return { delivered: 0 };
  }

  const payload = JSON.stringify({
    body:
      settings.showMessagePreview && input.body
        ? input.body.slice(0, 160)
        : "新しいメッセージがあります",
    title: input.title ?? "connect",
    url: input.url ?? "/",
  });
  let delivered = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime?.getTime() ?? null,
            keys: { auth: subscription.auth, p256dh: subscription.p256dh },
          },
          payload,
          {
            TTL: 60,
            timeout: 10_000,
            urgency: "normal",
            vapidDetails: configuration,
          },
        );
        delivered += 1;
        await database.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (error) {
        const statusCode = getPushStatusCode(error);
        if (statusCode === 404 || statusCode === 410) {
          await database.pushSubscription.deleteMany({
            where: { id: subscription.id },
          });
        } else {
          console.error("Failed to send push notification", error);
        }
      }
    }),
  );

  return { delivered };
}
