import dynamic from "next/dynamic";
import type { MouseEvent, RefObject } from "react";

import { splitMessageLinks } from "~/features/chat/message-links";

const UserProfileDialog = dynamic(() =>
  import("~/features/profile/components/user-profile-dialog").then(
    ({ UserProfileDialog }) => UserProfileDialog,
  ),
);

type ChatUser = {
  image?: string | null;
  name?: string | null;
  userId: string;
};

type PendingMessage = {
  content: string;
  createdAt: Date;
  status: "confirmed" | "pending";
};

const messageTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
});

export function getDisplayName(user: Pick<ChatUser, "name" | "userId">) {
  const name = user.name?.trim();

  if (!name) return user.userId;
  return name;
}

export function getServerDisplayName(member: {
  nickname?: string | null;
  user: Pick<ChatUser, "name" | "userId">;
}) {
  const nickname = member.nickname?.trim();

  if (!nickname) return getDisplayName(member.user);
  return nickname;
}

export function formatMessageTime(value: Date) {
  return messageTimeFormatter.format(value);
}

export function Avatar({
  className,
  user,
}: {
  className: string;
  user: ChatUser;
}) {
  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={user.image} alt="" className={`${className} object-cover`} />
    );
  }

  return (
    <span
      className={`${className} bg-connect-action text-connect-paper flex items-center justify-center font-semibold`}
    >
      {getDisplayName(user).slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ProfileAvatar({
  className,
  onClick,
  onContextMenu,
  serverId,
  user,
}: {
  className: string;
  onClick?: () => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  serverId?: string;
  user: ChatUser;
}) {
  const avatarButton = (
    <button
      type="button"
      onClick={onClick}
      className={`${className} border-connect-ink/10 focus-visible:ring-connect-action inline-flex shrink-0 overflow-hidden rounded-full border focus-visible:ring-2 focus-visible:outline-none`}
      aria-label={`${getDisplayName(user)}のプロフィールを開く`}
    >
      <Avatar user={user} className="h-full w-full rounded-full" />
    </button>
  );

  if (onClick) {
    return (
      <span className="contents" onContextMenu={onContextMenu}>
        {avatarButton}
      </span>
    );
  }

  return (
    <span className="contents" onContextMenu={onContextMenu}>
      <UserProfileDialog serverId={serverId} userId={user.userId}>
        {avatarButton}
      </UserProfileDialog>
    </span>
  );
}

export function MessageText({
  content,
  onOpenLink,
}: {
  content: string;
  onOpenLink: (url: string) => void;
}) {
  return splitMessageLinks(content).map((part, index) =>
    part.kind === "link" ? (
      <button
        key={`${index}:${part.value}`}
        type="button"
        onClick={() => onOpenLink(part.value)}
        className="text-connect-link decoration-connect-link/45 inline cursor-pointer border-0 bg-transparent p-0 align-baseline font-medium underline underline-offset-2 hover:decoration-current"
      >
        {part.value}
      </button>
    ) : (
      <span key={`${index}:${part.value}`}>{part.value}</span>
    ),
  );
}

export function PendingMessageRow({
  author,
  isFollowup = false,
  message,
  onOpenLink,
  onOpenProfile,
  serverId,
}: {
  author: ChatUser;
  isFollowup?: boolean;
  message: PendingMessage;
  onOpenLink: (url: string) => void;
  onOpenProfile?: () => void;
  serverId?: string;
}) {
  const isPending = message.status === "pending";

  return (
    <article
      className={`flex items-start gap-3 px-2 ${isFollowup ? "py-0.5" : "py-1.5"} ${isPending ? "text-connect-neutral" : "text-connect-ink"}`}
      aria-live="polite"
    >
      {isFollowup ? (
        <span className="w-10 shrink-0" aria-hidden="true" />
      ) : (
        <ProfileAvatar
          user={author}
          serverId={serverId}
          className="mt-1 h-10 w-10"
          onClick={onOpenProfile}
        />
      )}
      <div className="min-w-0 flex-1 text-left">
        {!isFollowup && (
          <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold">
              {getDisplayName(author)}
            </span>
            <time className="text-connect-neutral text-xs">
              {formatMessageTime(message.createdAt)}
            </time>
          </div>
        )}
        <p className="text-left leading-7 break-words whitespace-pre-wrap">
          <MessageText content={message.content} onOpenLink={onOpenLink} />
          {isPending && <span className="sr-only">送信中</span>}
        </p>
      </div>
    </article>
  );
}

export function NewMessagesSeparator({
  separatorRef,
}: {
  separatorRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={separatorRef}
      className="text-connect-danger mb-1 flex basis-full items-center gap-2 text-xs font-semibold"
      role="separator"
      aria-label="ここから新しいメッセージ"
    >
      <span className="bg-connect-danger/70 h-px flex-1" />
      <span>新しいメッセージ</span>
      <span className="bg-connect-danger/70 h-px flex-1" />
    </div>
  );
}
