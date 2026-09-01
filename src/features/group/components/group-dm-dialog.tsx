"use client";

import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  FileText,
  Link as LinkIcon,
  Plus,
  Quote,
  Reply,
  Send,
  Users,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  MessageText,
  ProfileAvatar,
  getDisplayName,
} from "~/features/chat/components/chat-message";
import {
  EmojiPickerButton,
  MessageAttachmentPicker,
  PendingAttachmentList,
  type PendingAttachment,
} from "~/features/chat/components/message-attachment-picker";
import { api } from "~/trpc/react";
import { groupReactions } from "~/features/chat/reaction-groups";

const REACTIONS = [
  "\u{1F44D}",
  "\u{2764}\u{FE0F}",
  "\u{1F602}",
  "\u{1F389}",
  "\u{1F62E}",
  "\u{1F64F}",
] as const;

function groupLabel(group: {
  members: Array<{ user: { name: string | null; userId: string } }>;
  name: string | null;
}) {
  return (
    (group.name?.trim() ??
      group.members
        .slice(0, 3)
        .map(({ user }) => user.name?.trim() ?? user.userId)
        .join("、")) ||
    "グループDM"
  );
}

export function GroupDmDialog({
  children,
  initialGroupId,
  onOpenChange,
  open: controlledOpen,
}: {
  children: ReactNode;
  initialGroupId?: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (nextOpen: boolean) => {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ content: string; id: string }>();
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [message, setMessage] = useState<string>();
  const [reportingMessageId, setReportingMessageId] = useState<string>();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const utils = api.useUtils();
  const groups = api.group.list.useQuery(undefined, { enabled: open });
  const friends = api.chat.getFriends.useQuery(undefined, {
    enabled: open && isCreating,
  });
  const conversation = api.group.getConversation.useInfiniteQuery(
    { groupId: selectedGroupId ?? "" },
    {
      enabled: open && Boolean(selectedGroupId),
      getNextPageParam: (page) => page.nextCursor,
    },
  );
  const createGroup = api.group.create.useMutation({
    onSuccess: async (group) => {
      await utils.group.list.invalidate();
      setSelectedGroupId(group.id);
      setIsCreating(false);
      setSelectedFriendIds([]);
      setGroupName("");
    },
    onError: (error) => setMessage(error.message),
  });
  const sendMessage = api.group.sendMessage.useMutation({
    onSuccess: async () => {
      setDraft("");
      setReplyTo(undefined);
      setAttachments([]);
      if (selectedGroupId)
        localStorage.removeItem(`connect:draft:group:${selectedGroupId}`);
      await Promise.all([
        utils.group.getConversation.invalidate(),
        utils.group.list.invalidate(),
      ]);
    },
    onError: (error) => setMessage(error.message),
  });
  const toggleReaction = api.group.toggleReaction.useMutation({
    onSuccess: async () => utils.group.getConversation.invalidate(),
  });
  const toggleSaved = api.group.toggleSaved.useMutation({
    onSuccess: async () => utils.group.getConversation.invalidate(),
  });
  const reportMessage = api.moderation.reportMessage.useMutation({
    onSuccess: () => {
      setReportingMessageId(undefined);
      setMessage("通報を受け付けました");
    },
    onError: (error) => setMessage(error.message),
  });

  const selectedGroup = groups.data?.groups.find(
    ({ id }) => id === selectedGroupId,
  );
  const messages = useMemo(
    () => conversation.data?.pages.flatMap((page) => page.messages) ?? [],
    [conversation.data?.pages],
  );

  useEffect(() => {
    if (initialGroupId) setSelectedGroupId(initialGroupId);
  }, [initialGroupId]);

  useEffect(() => {
    if (!selectedGroupId && groups.data?.groups[0]) {
      setSelectedGroupId(groups.data.groups[0].id);
    }
  }, [groups.data?.groups, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId) return;
    setDraft(
      localStorage.getItem(`connect:draft:group:${selectedGroupId}`) ?? "",
    );
    setReplyTo(undefined);
    setAttachments([]);
  }, [selectedGroupId]);

  const updateDraft = (value: string) => {
    setDraft(value);
    if (!selectedGroupId) return;
    const key = `connect:draft:group:${selectedGroupId}`;
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedGroupId || (!draft.trim() && attachments.length === 0)) return;
    sendMessage.mutate({
      attachmentIds: attachments.map(({ id }) => id),
      clientId: crypto.randomUUID(),
      content: draft.trim() || "添付ファイル",
      groupId: selectedGroupId,
      replyToId: replyTo?.id,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="bg-connect-paper text-connect-ink h-[min(92dvh,760px)] max-h-[92dvh] overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="sr-only">
          <DialogTitle>グループDM</DialogTitle>
          <DialogDescription>
            複数人のプライベート会話を作成・閲覧します。
          </DialogDescription>
        </DialogHeader>
        <div className="grid h-full min-h-0 grid-cols-1 sm:grid-cols-[280px_minmax(0,1fr)]">
          <aside
            className={`${selectedGroupId && !isCreating ? "hidden sm:flex" : "flex"} border-connect-ink/15 bg-connect-navigation min-h-0 flex-col border-r`}
          >
            <div className="border-connect-ink/15 flex h-14 items-center justify-between border-b py-0 pr-16 pl-4">
              <h2 className="font-bold">グループDM</h2>
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="hover:bg-connect-surface flex h-11 w-11 items-center justify-center rounded-md"
                aria-label="グループを作成"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {isCreating ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-connect-action mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  一覧へ
                </button>
                <label className="block text-sm font-semibold">
                  グループ名（任意）
                  <input
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    maxLength={50}
                    className="border-connect-ink/15 bg-connect-surface focus:ring-connect-action mt-2 min-h-11 w-full rounded-md border px-3 focus:ring-2 focus:outline-none"
                  />
                </label>
                <p className="mt-4 text-sm font-semibold">2人以上を選択</p>
                <div className="mt-2 space-y-1">
                  {(friends.data ?? [])
                    .filter((friend) => friend.isFriend && !friend.isBlocked)
                    .map(({ friend }) => (
                      <label
                        key={friend.id}
                        className="hover:bg-connect-surface flex min-h-12 items-center gap-3 rounded-md px-2"
                      >
                        <input
                          type="checkbox"
                          className="accent-connect-action h-5 w-5"
                          checked={selectedFriendIds.includes(friend.id)}
                          onChange={(event) =>
                            setSelectedFriendIds((current) =>
                              event.target.checked
                                ? [...current, friend.id]
                                : current.filter((id) => id !== friend.id),
                            )
                          }
                        />
                        <ProfileAvatar user={friend} className="h-8 w-8" />
                        <span className="min-w-0 truncate text-sm font-semibold">
                          {getDisplayName(friend)}
                        </span>
                      </label>
                    ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    createGroup.mutate({
                      memberIds: selectedFriendIds,
                      name: groupName || undefined,
                    })
                  }
                  disabled={
                    selectedFriendIds.length < 2 || createGroup.isPending
                  }
                  className="bg-connect-action text-connect-surface hover:bg-connect-action-hover mt-4 min-h-11 w-full rounded-md px-4 font-bold disabled:opacity-50"
                >
                  {createGroup.isPending ? "作成中…" : "グループを作成"}
                </button>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {groups.isLoading && (
                  <p className="text-connect-muted p-3 text-sm">読み込み中…</p>
                )}
                {groups.data?.groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`mb-1 w-full rounded-md p-3 text-left ${group.id === selectedGroupId ? "bg-connect-ink text-connect-paper" : "hover:bg-connect-surface"}`}
                  >
                    <span className="block truncate text-sm font-bold">
                      {groupLabel(group)}
                    </span>
                    <span
                      className={`mt-1 block truncate text-xs ${group.id === selectedGroupId ? "text-connect-focus-soft" : "text-connect-muted"}`}
                    >
                      {group.lastMessage?.content ??
                        `${group.members.length}人の会話`}
                    </span>
                  </button>
                ))}
                {groups.data?.groups.length === 0 && (
                  <div className="text-connect-muted p-4 text-sm">
                    <Users
                      className="text-connect-signal mb-2 h-5 w-5"
                      aria-hidden="true"
                    />
                    まだグループDMはありません。
                  </div>
                )}
              </div>
            )}
          </aside>

          <section
            className={`${!selectedGroupId || isCreating ? "hidden sm:flex" : "flex"} min-h-0 min-w-0 flex-col`}
          >
            <header className="border-connect-ink/15 bg-connect-highlight flex h-14 shrink-0 items-center gap-3 border-b py-0 pr-14 pl-3">
              <button
                type="button"
                onClick={() => setSelectedGroupId(undefined)}
                className="hover:bg-connect-surface flex h-11 w-11 items-center justify-center rounded-md sm:hidden"
                aria-label="グループ一覧"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <h2 className="truncate font-bold">
                  {selectedGroup ? groupLabel(selectedGroup) : "グループを選択"}
                </h2>
                {selectedGroup && (
                  <p className="text-connect-muted text-xs">
                    参加者 {selectedGroup.members.length}人
                  </p>
                )}
              </div>
            </header>
            <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {conversation.hasNextPage && (
                <button
                  type="button"
                  onClick={() => void conversation.fetchNextPage()}
                  className="border-connect-ink/15 bg-connect-surface mx-auto mb-4 block min-h-10 rounded-md border px-3 text-sm font-semibold"
                >
                  過去のメッセージ
                </button>
              )}
              <div className="space-y-2">
                {messages.map((chatMessage) => {
                  const reactionGroups = groupReactions(chatMessage.reactions);
                  return (
                    <article
                      key={chatMessage.id}
                      className="hover:bg-connect-surface group rounded-md p-2"
                    >
                      {chatMessage.replyTo && (
                        <div className="border-connect-action/30 text-connect-muted mb-1 block max-w-full truncate border-l-2 pl-2 text-xs">
                          {getDisplayName(chatMessage.replyTo.sender)}:{" "}
                          {chatMessage.replyTo.content}
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <ProfileAvatar
                          user={chatMessage.sender}
                          className="mt-1 h-9 w-9"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">
                            {getDisplayName(chatMessage.sender)}
                          </p>
                          <p className="leading-7 break-words whitespace-pre-wrap">
                            <MessageText
                              content={chatMessage.content}
                              onOpenLink={(url) =>
                                window.open(
                                  url,
                                  "_blank",
                                  "noopener,noreferrer",
                                )
                              }
                            />
                          </p>
                          {chatMessage.attachments.length > 0 && (
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              {chatMessage.attachments.map((attachment) =>
                                attachment.kind === "IMAGE" ? (
                                  <a
                                    key={attachment.id}
                                    href={`/api/attachments/${attachment.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="border-connect-ink/15 bg-connect-paper overflow-hidden rounded-md border"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={`/api/attachments/${attachment.id}`}
                                      alt={attachment.fileName}
                                      className="max-h-64 w-full object-contain"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    key={attachment.id}
                                    href={`/api/attachments/${attachment.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="border-connect-ink/15 bg-connect-paper flex min-h-12 items-center gap-2 rounded-md border px-3 text-sm font-semibold"
                                  >
                                    {attachment.kind === "PDF" ? (
                                      <FileText className="h-4 w-4" />
                                    ) : (
                                      <LinkIcon className="h-4 w-4" />
                                    )}
                                    <span className="truncate">
                                      {attachment.fileName}
                                    </span>
                                  </a>
                                ),
                              )}
                            </div>
                          )}
                          {reactionGroups.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {reactionGroups.map(([emoji, reactions]) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() =>
                                    selectedGroupId &&
                                    toggleReaction.mutate({
                                      emoji:
                                        emoji as (typeof REACTIONS)[number],
                                      groupId: selectedGroupId,
                                      messageId: chatMessage.id,
                                    })
                                  }
                                  className="border-connect-ink/15 bg-connect-paper hover:bg-connect-highlight min-h-8 rounded-full border px-2 text-xs"
                                >
                                  {emoji} {reactions.length}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setReplyTo({
                                content: chatMessage.content,
                                id: chatMessage.id,
                              })
                            }
                            className="hover:bg-connect-highlight flex h-9 w-9 items-center justify-center rounded-md"
                            aria-label="返信"
                          >
                            <Reply className="h-4 w-4" aria-hidden="true" />
                          </button>
                          {chatMessage.senderId !==
                            conversation.data?.pages[0]?.currentUser.id && (
                            <button
                              type="button"
                              onClick={() =>
                                setReportingMessageId(chatMessage.id)
                              }
                              className="hover:bg-connect-danger-soft text-connect-danger flex h-9 w-9 items-center justify-center rounded-md"
                              aria-label="通報"
                            >
                              <AlertCircle
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const quoted = chatMessage.content
                                .split("\n")
                                .map((line) => `> ${line}`)
                                .join("\n");
                              updateDraft(
                                `${draft.trimEnd()}${draft ? "\n" : ""}${quoted}\n`.slice(
                                  0,
                                  1000,
                                ),
                              );
                            }}
                            className="hover:bg-connect-highlight flex h-9 w-9 items-center justify-center rounded-md"
                            aria-label="引用"
                          >
                            <Quote className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              selectedGroupId &&
                              toggleSaved.mutate({
                                groupId: selectedGroupId,
                                messageId: chatMessage.id,
                              })
                            }
                            className="hover:bg-connect-highlight flex h-9 w-9 items-center justify-center rounded-md"
                            aria-label={
                              chatMessage.isSaved ? "保存解除" : "保存"
                            }
                          >
                            <Bookmark
                              className={`h-4 w-4 ${chatMessage.isSaved ? "fill-current" : ""}`}
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 ml-12 flex flex-wrap gap-1">
                        {REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() =>
                              selectedGroupId &&
                              toggleReaction.mutate({
                                emoji,
                                groupId: selectedGroupId,
                                messageId: chatMessage.id,
                              })
                            }
                            className="hover:bg-connect-highlight min-h-8 rounded-md px-1.5 text-sm"
                            aria-label={`${emoji}でリアクション`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
            {selectedGroupId && (
              <form onSubmit={submit} className="p-3">
                {replyTo && (
                  <div className="bg-connect-highlight border-connect-ink/15 flex items-center justify-between rounded-t-md border px-3 py-2 text-sm">
                    <span className="truncate">返信: {replyTo.content}</span>
                    <button
                      type="button"
                      onClick={() => setReplyTo(undefined)}
                      className="flex h-9 w-9 items-center justify-center"
                      aria-label="返信を解除"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <div
                  className={`border-connect-ink/15 bg-connect-surface flex flex-col border ${replyTo ? "rounded-b-md" : "rounded-md"}`}
                >
                  <PendingAttachmentList
                    attachments={attachments}
                    disabled={sendMessage.isPending}
                    onChange={setAttachments}
                  />
                  <div className="flex min-w-0 items-end gap-1 px-2 py-1.5">
                    <MessageAttachmentPicker
                      attachments={attachments}
                      disabled={sendMessage.isPending}
                      onChange={setAttachments}
                      onError={setMessage}
                    />
                    <textarea
                      ref={textareaRef}
                      data-chat-input
                      value={draft}
                      onChange={(event) => updateDraft(event.target.value)}
                      maxLength={1000}
                      rows={1}
                      placeholder="グループへメッセージ"
                      className="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2 outline-none"
                    />
                    <EmojiPickerButton
                      disabled={sendMessage.isPending}
                      onChange={updateDraft}
                      textareaRef={textareaRef}
                      value={draft}
                    />
                    <button
                      type="submit"
                      disabled={
                        sendMessage.isPending ||
                        (!draft.trim() && attachments.length === 0)
                      }
                      className="bg-connect-action text-connect-surface focus-visible:outline-connect-action enabled:hover:bg-connect-action-hover flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 enabled:active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="送信"
                    >
                      <Send className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </form>
            )}
            {message && (
              <p
                role="status"
                className="text-connect-danger px-4 pb-3 text-sm"
              >
                {message}
              </p>
            )}
          </section>
        </div>
      </DialogContent>
      <Dialog
        open={Boolean(reportingMessageId)}
        onOpenChange={(nextOpen) =>
          !nextOpen && setReportingMessageId(undefined)
        }
      >
        <DialogContent className="bg-connect-paper text-connect-ink sm:max-w-md">
          <DialogHeader>
            <DialogTitle>メッセージを通報</DialogTitle>
            <DialogDescription>
              嫌がらせ・危険な内容として運営へ送信します。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReportingMessageId(undefined)}
              className="border-connect-ink/15 min-h-11 rounded-md border px-4 font-semibold"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={!reportingMessageId || reportMessage.isPending}
              onClick={() =>
                reportingMessageId &&
                reportMessage.mutate({
                  messageId: reportingMessageId,
                  messageKind: "GROUP",
                  reason: "HARASSMENT",
                })
              }
              className="bg-connect-danger text-connect-surface min-h-11 rounded-md px-4 font-bold disabled:opacity-50"
            >
              通報する
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
