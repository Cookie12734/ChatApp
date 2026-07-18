export type ChatEvent =
  | { kind: "direct"; userIds: string[] }
  | { kind: "server"; serverId: string }
  | {
      isTyping: boolean;
      kind: "typing";
      senderId: string;
      userIds: string[];
      userName: string;
    };

type ChatEventListener = (event: ChatEvent) => void;

// ponytail: in-process fan-out is for one app instance; use shared pub/sub when horizontally scaling.
const globalForChatEvents = globalThis as typeof globalThis & {
  connectChatEventListeners?: Set<ChatEventListener>;
};

const listeners =
  globalForChatEvents.connectChatEventListeners ?? new Set<ChatEventListener>();

globalForChatEvents.connectChatEventListeners = listeners;

export function publishChatEvent(event: ChatEvent) {
  listeners.forEach((listener) => listener(event));
}

export function subscribeToChatEvents(listener: ChatEventListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canReceiveChatEvent(
  event: ChatEvent,
  userId: string,
  serverIds: Set<string>,
) {
  return event.kind === "server"
    ? serverIds.has(event.serverId)
    : event.userIds.includes(userId);
}
