import type { MessageCursor } from "./message-page";

// Serialize requests for the same message so a late edit cannot undo a delete.
export function createMessageEventQueue() {
  const pending = new Map<string, Promise<void>>();
  return (key: string, handle: () => Promise<void>) => {
    const previous = pending.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(handle);
    pending.set(key, next);
    const cleanup = () => {
      if (pending.get(key) === next) pending.delete(key);
    };
    void next.then(cleanup, cleanup);
    return next;
  };
}

export function updateMessagePages<
  M extends MessageCursor,
  P extends { messages: M[] },
>(pages: P[], message: M, change: "created" | "updated"): P[] {
  let found = false;
  const updated = pages.map((page) => {
    if (!page.messages.some(({ id }) => id === message.id)) return page;
    found = true;
    return {
      ...page,
      messages: page.messages.map((item) =>
        item.id === message.id ? message : item,
      ),
    };
  });
  if (found) return updated;
  const first = pages[0];
  if (change !== "created" || !first) return pages;
  return [
    {
      ...first,
      messages: [...first.messages, message].sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      ),
    },
    ...pages.slice(1),
  ];
}
