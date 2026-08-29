export const DEFAULT_NOTIFICATION_SETTINGS = {
  directMessages: true,
  groupMessages: true,
  mentions: true,
  friendRequests: true,
  matching: true,
  showMessagePreview: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  timeZone: null,
} as const;

export const PUSH_ENDPOINT_MAX_LENGTH = 2_048;
export const PUSH_P256DH_MIN_LENGTH = 64;
export const PUSH_P256DH_MAX_LENGTH = 256;
export const PUSH_AUTH_MIN_LENGTH = 16;
export const PUSH_AUTH_MAX_LENGTH = 128;

const trustedPushHosts = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
]);

export function isTrustedPushHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    trustedPushHosts.has(normalized) ||
    normalized === "push.apple.com" ||
    normalized.endsWith(".push.apple.com") ||
    normalized === "notify.windows.com" ||
    normalized.endsWith(".notify.windows.com")
  );
}

export function hasValidQuietHoursPair(
  start: number | null | undefined,
  end: number | null | undefined,
) {
  if (start === undefined || end === undefined) {
    return start === undefined && end === undefined;
  }
  if (start === null || end === null) {
    return start === null && end === null;
  }

  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    start <= 1_439 &&
    end >= 0 &&
    end <= 1_439
  );
}

export function isValidPushEndpoint(endpoint: string) {
  const normalized = endpoint.trim();
  if (!normalized || normalized.length > PUSH_ENDPOINT_MAX_LENGTH) return false;

  try {
    const url = new URL(normalized);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      isTrustedPushHost(url.hostname)
    );
  } catch {
    return false;
  }
}

export function hasValidP256dhLength(value: string) {
  return (
    value.length >= PUSH_P256DH_MIN_LENGTH &&
    value.length <= PUSH_P256DH_MAX_LENGTH
  );
}

export function hasValidPushAuthLength(value: string) {
  return (
    value.length >= PUSH_AUTH_MIN_LENGTH && value.length <= PUSH_AUTH_MAX_LENGTH
  );
}

export type PushNotificationKind =
  | "DIRECT_MESSAGE"
  | "GROUP_MESSAGE"
  | "MENTION"
  | "FRIEND_REQUEST"
  | "MATCHING";

export function getMinutesInTimeZone(date: Date, timeZone: string | null) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      timeZone: timeZone ?? "UTC",
    }).formatToParts(date);
    const hour = Number(parts.find(({ type }) => type === "hour")?.value);
    const minute = Number(parts.find(({ type }) => type === "minute")?.value);
    return Number.isInteger(hour) && Number.isInteger(minute)
      ? hour * 60 + minute
      : date.getUTCHours() * 60 + date.getUTCMinutes();
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

export function isWithinQuietHours(
  minutes: number,
  start: number | null,
  end: number | null,
) {
  if (start === null || end === null || start === end) return false;
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

export function isNotificationKindEnabled(
  settings: {
    directMessages: boolean;
    friendRequests: boolean;
    groupMessages: boolean;
    matching: boolean;
    mentions: boolean;
  },
  kind: PushNotificationKind,
) {
  switch (kind) {
    case "DIRECT_MESSAGE":
      return settings.directMessages;
    case "GROUP_MESSAGE":
      return settings.groupMessages;
    case "MENTION":
      return settings.mentions;
    case "FRIEND_REQUEST":
      return settings.friendRequests;
    case "MATCHING":
      return settings.matching;
  }
}
