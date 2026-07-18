import type { RefObject } from "react";

import { splitMessageLinks } from "~/features/chat/message-links";
import { UserProfileDialog } from "~/features/profile/components/user-profile-dialog";

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
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
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
      className={`${className} flex items-center justify-center bg-[#114744] font-semibold text-[#f6f0e4]`}
    >
      {getDisplayName(user).slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ProfileAvatar({
  className,
  serverId,
  user,
}: {
  className: string;
  serverId?: string;
  user: ChatUser;
}) {
  return (
    <UserProfileDialog serverId={serverId} userId={user.userId}>
      <button
        type="button"
        className={`${className} inline-flex shrink-0 overflow-hidden rounded-full border border-black/10 focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:outline-none`}
        aria-label={`${getDisplayName(user)}のプロフィールを開く`}
      >
        <Avatar user={user} className="h-full w-full rounded-full" />
      </button>
    </UserProfileDialog>
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
        className="inline cursor-pointer border-0 bg-transparent p-0 align-baseline font-medium text-[#0b5f89] underline decoration-[#0b5f89]/45 underline-offset-2 hover:decoration-current"
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
  serverId,
}: {
  author: ChatUser;
  isFollowup?: boolean;
  message: PendingMessage;
  onOpenLink: (url: string) => void;
  serverId?: string;
}) {
  const isPending = message.status === "pending";

  return (
    <article
      className={`flex items-start gap-3 px-2 ${isFollowup ? "py-0.5" : "py-1.5"} ${isPending ? "text-[#7d8781]" : "text-[#18221f]"}`}
      aria-live="polite"
    >
      {isFollowup ? (
        <span className="w-10 shrink-0" aria-hidden="true" />
      ) : (
        <ProfileAvatar
          user={author}
          serverId={serverId}
          className="mt-1 h-10 w-10"
        />
      )}
      <div className="min-w-0 flex-1 text-left">
        {!isFollowup && (
          <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold">
              {getDisplayName(author)}
            </span>
            <time className="text-xs text-[#68716b]">
              {formatMessageTime(message.createdAt)}
            </time>
            {isPending && <span className="text-xs">送信中...</span>}
          </div>
        )}
        <p className="text-left leading-7 break-words whitespace-pre-wrap">
          <MessageText content={message.content} onOpenLink={onOpenLink} />
          {isPending && isFollowup && (
            <span className="ml-2 text-xs">送信中...</span>
          )}
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
      className="mb-1 flex basis-full items-center gap-2 text-xs font-semibold text-[#9f4122]"
      role="separator"
      aria-label="ここから新しいメッセージ"
    >
      <span className="h-px flex-1 bg-[#9f4122]/70" />
      <span>新しいメッセージ</span>
      <span className="h-px flex-1 bg-[#9f4122]/70" />
    </div>
  );
}
