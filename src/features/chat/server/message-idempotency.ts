type DirectMessagePayload = {
  content: string;
  receiverId: string;
};

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
