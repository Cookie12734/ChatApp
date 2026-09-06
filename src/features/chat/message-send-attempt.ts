type MessageSendPayload = {
  attachmentIds: string[];
  content: string;
  conversationId: string;
  replyToId?: string;
};

export type MessageSendAttempt = {
  clientId: string;
  payloadKey: string;
};

export function getMessageSendAttempt(
  previous: MessageSendAttempt | undefined,
  input: MessageSendPayload,
): MessageSendAttempt {
  const payloadKey = JSON.stringify([
    input.conversationId,
    input.content,
    input.replyToId ?? null,
    [...input.attachmentIds].sort(),
  ]);
  return previous?.payloadKey === payloadKey
    ? previous
    : { clientId: crypto.randomUUID(), payloadKey };
}
