export const MESSAGE_PAGE_SIZE = 100;

export function prepareMessagePage<T extends { id: string }>(
  messages: T[],
  limit = MESSAGE_PAGE_SIZE,
) {
  return {
    messages: messages.slice(0, limit).reverse(),
    nextCursor: messages[limit]?.id,
  };
}
