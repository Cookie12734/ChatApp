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
  open,
  serverId,
}: {
  isLoading: boolean;
  messages?: PinnedMessage[];
  onOpenChange: (open: boolean) => void;
  onOpenLink: (url: string) => void;
  open: boolean;
  serverId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto bg-[#f6f0e4] p-0 text-[#18221f] sm:max-w-xl">
        <DialogHeader className="border-b border-[#18221f]/15 px-5 py-4">
          <DialogTitle>ピン留めしたメッセージ</DialogTitle>
          <DialogDescription className="sr-only">
            このチャンネルでピン留めされているメッセージの一覧です。
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-[#18221f]/10 px-5 py-2">
          {isLoading && (
            <p className="py-6 text-sm text-[#68716b]">読み込み中...</p>
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
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold">
                      {getDisplayName(author)}
                    </span>
                    <time className="text-xs text-[#68716b]">
                      {formatMessageTime(message.createdAt)}
                    </time>
                  </div>
                  {message.isBlocked ? (
                    <details className="rounded-md border border-[#18221f]/10 bg-[#f1e4d0] px-3 py-2 text-sm text-[#53615a]">
                      <summary className="cursor-pointer font-medium">
                        ブロック関係にあるユーザーのメッセージ
                      </summary>
                      <p className="mt-2 leading-7 break-words whitespace-pre-wrap text-[#18221f]">
                        <MessageText
                          content={message.content}
                          onOpenLink={onOpenLink}
                        />
                      </p>
                    </details>
                  ) : (
                    <p className="leading-7 break-words whitespace-pre-wrap">
                      <MessageText
                        content={message.content}
                        onOpenLink={onOpenLink}
                      />
                    </p>
                  )}
                </div>
              </article>
            );
          })}
          {messages?.length === 0 && (
            <p className="py-6 text-sm text-[#68716b]">
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
      <DialogContent className="bg-[#fff8ed] text-[#18221f] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>外部リンクを開きますか？</DialogTitle>
          <DialogDescription className="text-[#68716b]">
            次のリンクを新しいタブで開きます。
          </DialogDescription>
        </DialogHeader>
        <p className="max-h-32 overflow-y-auto rounded-md bg-[#f6f0e4] px-3 py-2 text-sm break-all text-[#53615a]">
          {url}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center rounded-md border border-[#18221f]/15 px-4 text-sm font-semibold text-[#53615a] transition hover:bg-[#f6f0e4]"
          >
            キャンセル
          </button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="inline-flex min-h-10 items-center rounded-md bg-[#114744] px-4 text-sm font-semibold text-white transition hover:bg-[#0d3936]"
            >
              開く
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
