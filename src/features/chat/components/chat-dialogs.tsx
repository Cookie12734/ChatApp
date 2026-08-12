import type { MouseEvent } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  formatMessageTime,
  getDisplayName,
  MessageText,
  ProfileAvatar,
} from "~/features/chat/components/chat-message";
import type { RouterOutputs } from "~/trpc/react";

type PinnedMessage =
  RouterOutputs["server"]["getConversation"]["pinnedMessages"][number];

export function PinnedMessagesDialog({
  isLoading,
  messages,
  onOpenChange,
  onOpenLink,
  onProfileContextMenu,
  open,
  serverId,
}: {
  isLoading: boolean;
  messages?: PinnedMessage[];
  onOpenChange: (open: boolean) => void;
  onOpenLink: (url: string) => void;
  onProfileContextMenu: (
    event: MouseEvent<HTMLElement>,
    user: { name?: string | null; userId: string },
  ) => void;
  open: boolean;
  serverId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-connect-paper text-connect-ink max-h-[92dvh] overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="border-connect-ink/15 border-b px-5 py-4">
          <DialogTitle>ピン留めしたメッセージ</DialogTitle>
          <DialogDescription className="sr-only">
            このチャンネルでピン留めされているメッセージの一覧です。
          </DialogDescription>
        </DialogHeader>
        <div className="divide-connect-ink/10 divide-y px-5 py-2">
          {isLoading && (
            <p className="text-connect-neutral py-6 text-sm">読み込み中...</p>
          )}
          {messages?.map((message) => {
            const author = {
              ...message.sender,
              name:
                message.sender.serverMemberships[0]?.nickname ??
                message.sender.name,
            };

            return (
              <article key={message.id} className="flex gap-3 py-4">
                <ProfileAvatar
                  user={author}
                  serverId={serverId}
                  className="h-10 w-10"
                  onContextMenu={(event) => onProfileContextMenu(event, author)}
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold">
                      {getDisplayName(author)}
                    </span>
                    <time className="text-connect-neutral text-xs">
                      {formatMessageTime(message.createdAt)}
                    </time>
                  </div>
                  <p className="leading-7 break-words whitespace-pre-wrap">
                    <MessageText
                      content={message.content}
                      onOpenLink={onOpenLink}
                    />
                  </p>
                </div>
              </article>
            );
          })}
          {messages?.length === 0 && (
            <p className="text-connect-neutral py-6 text-sm">
              ピン留めされたメッセージはありません
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExternalLinkDialog({
  onClose,
  url,
}: {
  onClose: () => void;
  url: string | null;
}) {
  return (
    <Dialog open={url !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-connect-surface text-connect-ink sm:max-w-md">
        <DialogHeader>
          <DialogTitle>外部リンクを開きますか？</DialogTitle>
          <DialogDescription className="text-connect-neutral">
            次のリンクを新しいタブで開きます。
          </DialogDescription>
        </DialogHeader>
        <p className="bg-connect-paper text-connect-muted max-h-32 overflow-y-auto rounded-md px-3 py-2 text-sm break-all">
          {url}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border-connect-ink/15 text-connect-muted hover:bg-connect-paper inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-semibold transition"
          >
            キャンセル
          </button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="bg-connect-action text-connect-surface hover:bg-connect-action-hover inline-flex min-h-10 items-center rounded-md px-4 text-sm font-semibold transition"
            >
              開く
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
