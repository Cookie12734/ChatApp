const MESSAGE_GROUP_WINDOW_MS = 10 * 60 * 1000;

type GroupableMessage = {
  createdAt: Date;
  senderId: string;
};

export function shouldGroupMessage(
  message: GroupableMessage,
  previousMessage?: GroupableMessage,
) {
  if (previousMessage?.senderId !== message.senderId) {
    return false;
  }

  const elapsed =
    message.createdAt.getTime() - previousMessage.createdAt.getTime();
  return elapsed >= 0 && elapsed <= MESSAGE_GROUP_WINDOW_MS;
}
