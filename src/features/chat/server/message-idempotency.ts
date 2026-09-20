type DirectMessagePayload = {
  content: string;
  receiverId: string;
};

export function isSameAttachmentSet(
  attachments: { id: string }[],
  attachmentIds: string[],
) {
  const ids = new Set(attachmentIds);
  return (
    ids.size === attachmentIds.length &&
    attachments.length === ids.size &&
    attachments.every(({ id }) => ids.has(id))
  );
}

type ServerMessagePayload = {
  channelId: string | null;
  content: string;
  serverId: string;
};

export function isSameDirectMessage(
  message: DirectMessagePayload,
  input: DirectMessagePayload,
) {
  return (
    message.content === input.content && message.receiverId === input.receiverId
  );
}

export function isSameServerMessage(
  message: ServerMessagePayload,
  input: ServerMessagePayload,
) {
  return (
    message.channelId === input.channelId &&
    message.content === input.content &&
    message.serverId === input.serverId
  );
}
