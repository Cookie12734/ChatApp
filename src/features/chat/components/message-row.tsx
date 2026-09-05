"use client";

import { FileText, Link as LinkIcon, Pin, Settings } from "lucide-react";
import Image from "next/image";
import { memo, type FormEvent, type MouseEvent, type RefObject } from "react";

import {
  formatMessageTime,
  getDisplayName,
  MessageText,
  NewMessagesSeparator,
  ProfileAvatar,
} from "~/features/chat/components/chat-message";
import { groupReactions } from "~/features/chat/reaction-groups";

type VisibleMessageAttachment = {
  fileName: string;
  id: string;
  kind: "IMAGE" | "LINK" | "PDF";
};

function MessageAttachmentList({
  attachments,
}: {
  attachments: VisibleMessageAttachment[];
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="mt-2 grid max-w-2xl gap-2 sm:grid-cols-2">
      {attachments.map((attachment) => {
        const href = `/api/attachments/${attachment.id}`;
        if (attachment.kind === "IMAGE") {
          return (
            <a
              key={attachment.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="border-connect-ink/15 bg-connect-paper overflow-hidden rounded-md border"
            >
              <Image
                src={href}
                alt={attachment.fileName}
                width={640}
                height={480}
                unoptimized
                loading="lazy"
                className="h-auto max-h-80 w-full object-contain"
              />
              <span className="block truncate px-3 py-2 text-xs font-semibold">
                {attachment.fileName}
              </span>
            </a>
          );
        }

        return (
          <a
            key={attachment.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="border-connect-ink/15 bg-connect-paper flex min-h-12 items-center gap-2 rounded-md border px-3 text-sm font-semibold"
          >
            {attachment.kind === "PDF" ? (
              <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <LinkIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{attachment.fileName}</span>
          </a>
        );
      })}
    </div>
  );
}

type MessageRowUser = {
  id?: string;
  image?: string | null;
  name?: string | null;
  userId: string;
};
type MessageRowData = {
  attachments: VisibleMessageAttachment[];
  content: string;
  createdAt: Date;
  id: string;
  pinnedAt?: Date | null;
  reactions: Array<{ emoji: string; userId: string }>;
  replyTo?: {
    content: string;
    id: string;
    sender: MessageRowUser;
  } | null;
};
export type ReactionEmoji =
  | "\u{1F44D}"
  | "\u{2764}\u{FE0F}"
  | "\u{1F602}"
  | "\u{1F389}"
  | "\u{1F62E}"
  | "\u{1F64F}";

type MessageRowProps = {
  author: MessageRowUser;
  canReact: boolean;
  editingContent: string | null;
  firstUnread: boolean;
  isFollowup: boolean;
  isMenuOpen: boolean;
  isUpdating: boolean;
  message: MessageRowData;
  onCancelEdit: () => void;
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
  onEditChange: (content: string) => void;
  onEditSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenLink: (url: string) => void;
  onOpenProfile: () => void;
  onProfileContextMenu: (event: MouseEvent<HTMLElement>) => void;
  onReact: (emoji: ReactionEmoji) => void;
  separatorRef: RefObject<HTMLDivElement | null>;
  serverId?: string;
};

export const MessageRow = memo(
  function MessageRow({
    author,
    canReact,
    editingContent,
    firstUnread,
    isFollowup,
    isMenuOpen,
    isUpdating,
    message,
    onCancelEdit,
    onContextMenu,
    onEditChange,
    onEditSubmit,
    onOpenLink,
    onOpenProfile,
    onProfileContextMenu,
    onReact,
    separatorRef,
    serverId,
  }: MessageRowProps) {
    return (
      <article
        onContextMenu={onContextMenu}
        className={`group hover:bg-connect-paper relative flex flex-wrap items-start gap-x-3 gap-y-0 rounded-md px-2 ${isFollowup ? "py-0.5" : "py-1.5"}`}
      >
        {firstUnread && <NewMessagesSeparator separatorRef={separatorRef} />}
        {isFollowup ? (
          <time
            dateTime={message.createdAt.toISOString()}
            className="text-connect-neutral mt-1 w-10 shrink-0 text-center text-[10px] opacity-0 transition group-hover:opacity-100"
            aria-label={`${getDisplayName(author)}、${formatMessageTime(message.createdAt)}`}
          >
            {formatMessageTime(message.createdAt)}
          </time>
        ) : (
          <ProfileAvatar
            user={author}
            serverId={serverId}
            className="mt-1 h-10 w-10"
            onClick={onOpenProfile}
            onContextMenu={onProfileContextMenu}
          />
        )}
        <div className="min-w-0 flex-1 text-left">
          {message.replyTo && (
            <div className="border-connect-action/35 text-connect-muted mb-1 block max-w-full truncate border-l-2 pl-2 text-xs">
              {getDisplayName(message.replyTo.sender)}:{" "}
              {message.replyTo.content}
            </div>
          )}
          {!isFollowup && (
            <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-connect-ink text-sm font-semibold">
                {getDisplayName(author)}
              </span>
              <time className="text-connect-neutral text-xs">
                {formatMessageTime(message.createdAt)}
              </time>
              {message.pinnedAt && (
                <span className="text-connect-action inline-flex items-center gap-1 text-xs font-medium">
                  <Pin className="h-3 w-3" aria-hidden="true" />
                  ピン留め
                </span>
              )}
            </div>
          )}
          {editingContent !== null ? (
            <form onSubmit={onEditSubmit} className="space-y-2">
              <textarea
                value={editingContent}
                onChange={(event) => onEditChange(event.target.value)}
                className="border-connect-ink/15 bg-connect-surface text-connect-ink focus:border-connect-action focus:ring-connect-focus-soft min-h-24 w-full resize-y rounded-md border px-3 py-2 text-left leading-6 focus:ring-2 focus:outline-none"
                maxLength={1000}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="border-connect-ink/15 text-connect-muted hover:bg-connect-paper inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={!editingContent.trim() || isUpdating}
                  className="bg-connect-action text-connect-surface hover:bg-connect-action-hover inline-flex min-h-9 items-center rounded-md px-3 text-sm font-semibold transition disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </form>
          ) : (
            <p className="text-connect-ink text-left leading-7 break-words whitespace-pre-wrap">
              <MessageText content={message.content} onOpenLink={onOpenLink} />
            </p>
          )}
          <MessageAttachmentList attachments={message.attachments} />
          {message.reactions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {groupReactions(message.reactions).map(([emoji, reactions]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji as ReactionEmoji)}
                  disabled={!canReact}
                  className="border-connect-ink/15 bg-connect-paper min-h-8 rounded-full border px-2 text-xs disabled:cursor-default"
                  title={
                    canReact
                      ? undefined
                      : "閲覧のみのためリアクションできません"
                  }
                >
                  {emoji} {reactions.length}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onContextMenu}
          className="text-connect-muted hover:bg-connect-highlight focus-visible:ring-connect-action flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none md:absolute md:top-1 md:right-2"
          aria-label="メッセージ操作"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </button>
      </article>
    );
  },
  (previous, next) =>
    previous.message === next.message &&
    previous.author.id === next.author.id &&
    previous.author.image === next.author.image &&
    previous.author.name === next.author.name &&
    previous.author.userId === next.author.userId &&
    previous.canReact === next.canReact &&
    previous.editingContent === next.editingContent &&
    previous.firstUnread === next.firstUnread &&
    previous.isFollowup === next.isFollowup &&
    previous.isMenuOpen === next.isMenuOpen &&
    previous.isUpdating === next.isUpdating &&
    previous.serverId === next.serverId,
);
