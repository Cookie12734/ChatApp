export const MESSAGE_PAGE_SIZE = 100;

export type MessageCursor = {
  createdAt: Date;
  id: string;
};

const MESSAGE_CURSOR_PREFIX = "v1:";

export function encodeMessageCursor({ createdAt, id }: MessageCursor) {
  return `${MESSAGE_CURSOR_PREFIX}${createdAt.getTime()}:${id}`;
}

export function decodeMessageCursor(value: string | null | undefined) {
  if (!value?.startsWith(MESSAGE_CURSOR_PREFIX)) return undefined;

  const separatorIndex = value.indexOf(":", MESSAGE_CURSOR_PREFIX.length);
  const rawTimestamp = value.slice(
    MESSAGE_CURSOR_PREFIX.length,
    separatorIndex,
  );
  const timestamp = Number(rawTimestamp);
  const id = value.slice(separatorIndex + 1);
  const createdAt = new Date(timestamp);

  if (
    separatorIndex === -1 ||
    !/^\d+$/.test(rawTimestamp) ||
    !Number.isSafeInteger(timestamp) ||
    Number.isNaN(createdAt.getTime()) ||
    !id
  ) {
    return undefined;
  }

  return { createdAt, id };
}

export function getMessageCursorWhere(cursor: MessageCursor | undefined) {
  return cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : {};
}

export function prepareMessagePage<T extends MessageCursor>(
  messages: T[],
  limit = MESSAGE_PAGE_SIZE,
) {
  const nextBoundary =
    messages.length > limit ? messages[limit - 1] : undefined;

  return {
    messages: messages.slice(0, limit).reverse(),
    nextCursor: nextBoundary ? encodeMessageCursor(nextBoundary) : undefined,
  };
}
