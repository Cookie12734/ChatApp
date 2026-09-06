"use client";

import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  Ellipsis,
  FileText,
  Link as LinkIcon,
  Plus,
  Quote,
  Reply,
  Send,
  Users,
  X,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import {
  Fragment,
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
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
  formatMessageTime,
} from "~/features/chat/components/chat-message";
import { ChatConnectionStatus } from "~/features/chat/components/chat-connection-status";
import {
  EmojiPickerButton,
  MessageAttachmentPicker,
  PendingAttachmentList,
  type PendingAttachment,
} from "~/features/chat/components/message-attachment-picker";
import { api } from "~/trpc/react";
import { groupReactions } from "~/features/chat/reaction-groups";
import { flattenMessagePages } from "~/features/chat/message-page";
import {
  getMessageSendAttempt,
  type MessageSendAttempt,
} from "~/features/chat/message-send-attempt";

const REACTIONS = [
  "\u{1F44D}",
  "\u{2764}\u{FE0F}",
  "\u{1F602}",
  "\u{1F389}",
  "\u{1F62E}",
  "\u{1F64F}",
] as const;

const messageDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const menuItemClassName =
  "data-[highlighted]:bg-connect-highlight flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

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
  isRealtimeConnected = false,
  isReconnecting = false,
  onOpenChange,
  open: controlledOpen,
}: {
  children?: ReactNode;
  initialGroupId?: string;
  isRealtimeConnected?: boolean;
  isReconnecting?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (nextOpen: boolean) => {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const [selectedGroupId, setSelectedGroupId] = useState<
    string | null | undefined
  >(initialGroupId);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ content: string; id: string }>();
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [message, setMessage] = useState<string>();
  const [reportingMessageId, setReportingMessageId] = useState<string>();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [messageScrollElement, setMessageScrollElement] =
    useState<HTMLDivElement | null>(null);
  const initialScrollGroupId = useRef<string | undefined>(undefined);
  const draftRevisions = useRef(new Map<string, number>());
  const focusComposerAfterMenuClose = useRef(false);
  const inputHintId = useId();
  const sendAttempts = useRef(new Map<string, MessageSendAttempt>());
  const utils = api.useUtils();
  const groups = api.group.list.useQuery(undefined, {
    enabled: open,
    refetchInterval: open && !isRealtimeConnected ? 5000 : false,
  });
  const currentUserId = groups.data?.currentUserId;
  const draftKey =
    currentUserId && selectedGroupId
      ? `connect:draft:${currentUserId}:group:${selectedGroupId}`
      : null;
  const friends = api.chat.getFriends.useQuery(undefined, {
    enabled: open && isCreating,
  });
  const conversation = api.group.getConversation.useInfiniteQuery(
    { groupId: selectedGroupId ?? "" },
    {
      enabled:
        open &&
        Boolean(groups.data?.groups.some(({ id }) => id === selectedGroupId)),
      getNextPageParam: (page) => page.nextCursor,
      refetchInterval: open && !isRealtimeConnected ? 5000 : false,
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
    onMutate: () => ({
      draftKey,
      revision: draftKey ? (draftRevisions.current.get(draftKey) ?? 0) : 0,
    }),
    onSuccess: async (_message, variables, submittedDraft) => {
      sendAttempts.current.delete(variables.groupId);
      if (
        submittedDraft?.draftKey &&
        (draftRevisions.current.get(submittedDraft.draftKey) ?? 0) ===
          submittedDraft.revision
      ) {
        localStorage.removeItem(submittedDraft.draftKey);
        if (submittedDraft.draftKey === draftKey) setDraft("");
      }
      if (variables.groupId === selectedGroupId) {
        setReplyTo((current) =>
          current?.id === variables.replyToId ? undefined : current,
        );
        setAttachments((current) =>
          current.filter(({ id }) => !variables.attachmentIds?.includes(id)),
        );
      }
      await Promise.all([
        utils.group.getConversation.invalidate(),
        utils.group.list.invalidate(),
      ]);
    },
    onError: (error) => setMessage(error.message),
  });
  const toggleReaction = api.group.toggleReaction.useMutation({
    onSuccess: async () => utils.group.getConversation.invalidate(),
    onError: (error) => setMessage(error.message),
  });
  const toggleSaved = api.group.toggleSaved.useMutation({
    onSuccess: async () => utils.group.getConversation.invalidate(),
    onError: (error) => setMessage(error.message),
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
    () =>
      selectedGroup && conversation.data
        ? flattenMessagePages(conversation.data.pages)
        : [],
    [conversation.data, selectedGroup],
  );

  useEffect(() => {
    if (initialGroupId) setSelectedGroupId(initialGroupId);
  }, [initialGroupId]);

  useEffect(() => {
    if (
      groups.data &&
      selectedGroupId !== null &&
      !groups.data.groups.some(({ id }) => id === selectedGroupId)
    ) {
      setSelectedGroupId(groups.data.groups[0]?.id);
    }
  }, [groups.data, selectedGroupId]);

  useLayoutEffect(() => {
    initialScrollGroupId.current = undefined;
  }, [open, isCreating, selectedGroupId]);

  useLayoutEffect(() => {
    if (
      open &&
      !isCreating &&
      selectedGroup &&
      conversation.data &&
      initialScrollGroupId.current !== selectedGroup.id &&
      messageScrollElement
    ) {
      messageScrollElement.scrollTop = messageScrollElement.scrollHeight;
      initialScrollGroupId.current = selectedGroup.id;
    }
  }, [
    open,
    isCreating,
    selectedGroup,
    conversation.data,
    messageScrollElement,
  ]);

  useEffect(() => {
    setDraft(draftKey ? (localStorage.getItem(draftKey) ?? "") : "");
    setReplyTo(undefined);
    setAttachments([]);
  }, [draftKey]);

  const updateDraft = (value: string) => {
    setDraft(value);
    if (!draftKey) return;
    draftRevisions.current.set(
      draftKey,
      (draftRevisions.current.get(draftKey) ?? 0) + 1,
    );
    if (value) localStorage.setItem(draftKey, value);
    else localStorage.removeItem(draftKey);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      !selectedGroupId ||
      !currentUserId ||
      sendMessage.isPending ||
      (!draft.trim() && attachments.length === 0)
    )
      return;
    const input = {
      attachmentIds: attachments.map(({ id }) => id),
      content: draft.trim() || "添付ファイル",
      groupId: selectedGroupId,
      replyToId: replyTo?.id,
    };
    const previousAttempt = sendAttempts.current.get(selectedGroupId);
    const attempt = getMessageSendAttempt(previousAttempt, {
      ...input,
      conversationId: draftKey ?? selectedGroupId,
    });
    sendAttempts.current.set(selectedGroupId, attempt);
    setMessage(undefined);
    sendMessage.mutate({ ...input, clientId: attempt.clientId });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
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
                onClick={() => setSelectedGroupId(null)}
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
            <ChatConnectionStatus isReconnecting={isReconnecting} />
            <div
              ref={setMessageScrollElement}
              className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4"
            >
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
                {messages.map((chatMessage, index) => {
                  const reactionGroups = groupReactions(chatMessage.reactions);
                  const startsNewDay =
                    messages[index - 1]?.createdAt.toDateString() !==
                    chatMessage.createdAt.toDateString();
                  return (
                    <Fragment key={chatMessage.id}>
                      {startsNewDay && (
                        <div className="text-connect-muted flex items-center gap-3 py-3 text-xs">
                          <span className="bg-connect-ink/15 h-px flex-1" />
                          <time dateTime={chatMessage.createdAt.toISOString()}>
                            {messageDateFormatter.format(chatMessage.createdAt)}
                          </time>
                          <span className="bg-connect-ink/15 h-px flex-1" />
                        </div>
                      )}
                      <article className="hover:bg-connect-surface group rounded-md p-2">
                        {chatMessage.replyTo && (
                          <div className="border-connect-action/30 text-connect-muted mb-1 block max-w-full truncate border-l-2 pl-2 text-xs">
                            {getDisplayName(chatMessage.replyTo.sender)}:{" "}
                            {chatMessage.replyTo.content}
                          </div>
                        )}
                        <div className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-x-3">
                          <ProfileAvatar
                            user={chatMessage.sender}
                            className="mt-1 h-9 w-9"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <p className="min-w-0 text-sm font-bold break-words">
                                {getDisplayName(chatMessage.sender)}
                              </p>
                              <time
                                dateTime={chatMessage.createdAt.toISOString()}
                                className="text-connect-muted shrink-0 text-xs"
                              >
                                {formatMessageTime(chatMessage.createdAt)}
                              </time>
                            </div>
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
                          <div className="col-start-2 flex gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTo({
                                  content: chatMessage.content,
                                  id: chatMessage.id,
                                });
                                textareaRef.current?.focus();
                              }}
                              className="hover:bg-connect-highlight flex h-11 w-11 items-center justify-center rounded-md"
                              aria-label="返信"
                            >
                              <Reply className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <DropdownMenu.Root>
                              <DropdownMenu.Trigger asChild>
                                <button
                                  type="button"
                                  className="hover:bg-connect-highlight flex h-11 w-11 items-center justify-center rounded-md"
                                  aria-label="その他の操作"
                                >
                                  <Ellipsis
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                </button>
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                  align="end"
                                  sideOffset={4}
                                  collisionPadding={12}
                                  onCloseAutoFocus={(event) => {
                                    if (focusComposerAfterMenuClose.current) {
                                      event.preventDefault();
                                      focusComposerAfterMenuClose.current = false;
                                      textareaRef.current?.focus();
                                    } else if (reportingMessageId) {
                                      event.preventDefault();
                                    }
                                  }}
                                  className="border-connect-ink/15 bg-connect-paper text-connect-ink z-[var(--z-dropdown)] max-h-[var(--radix-dropdown-menu-content-available-height)] w-56 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border p-1 shadow-md"
                                >
                                  <DropdownMenu.Item
                                    disabled={sendMessage.isPending}
                                    onSelect={() => {
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
                                      focusComposerAfterMenuClose.current = true;
                                    }}
                                    className={menuItemClassName}
                                  >
                                    <Quote
                                      className="h-4 w-4"
                                      aria-hidden="true"
                                    />
                                    引用
                                  </DropdownMenu.Item>
                                  <DropdownMenu.Item
                                    disabled={toggleSaved.isPending}
                                    onSelect={() =>
                                      selectedGroupId &&
                                      toggleSaved.mutate({
                                        groupId: selectedGroupId,
                                        messageId: chatMessage.id,
                                      })
                                    }
                                    className={menuItemClassName}
                                  >
                                    <Bookmark
                                      className={`h-4 w-4 ${chatMessage.isSaved ? "fill-current" : ""}`}
                                      aria-hidden="true"
                                    />
                                    {chatMessage.isSaved ? "保存解除" : "保存"}
                                  </DropdownMenu.Item>
                                  <DropdownMenu.Separator className="bg-connect-ink/15 my-1 h-px" />
                                  <DropdownMenu.Label className="text-connect-muted px-3 py-2 text-xs">
                                    リアクション
                                  </DropdownMenu.Label>
                                  <div className="grid grid-cols-3 gap-1">
                                    {REACTIONS.map((emoji) => (
                                      <DropdownMenu.Item
                                        key={emoji}
                                        disabled={toggleReaction.isPending}
                                        onSelect={() =>
                                          selectedGroupId &&
                                          toggleReaction.mutate({
                                            emoji,
                                            groupId: selectedGroupId,
                                            messageId: chatMessage.id,
                                          })
                                        }
                                        className={`${menuItemClassName} justify-center`}
                                        aria-label={`${emoji}でリアクション`}
                                      >
                                        {emoji}
                                      </DropdownMenu.Item>
                                    ))}
                                  </div>
                                  {chatMessage.senderId !== currentUserId && (
                                    <>
                                      <DropdownMenu.Separator className="bg-connect-ink/15 my-1 h-px" />
                                      <DropdownMenu.Item
                                        onSelect={() =>
                                          setReportingMessageId(chatMessage.id)
                                        }
                                        className={`${menuItemClassName} text-connect-danger`}
                                      >
                                        <AlertCircle
                                          className="h-4 w-4"
                                          aria-hidden="true"
                                        />
                                        通報
                                      </DropdownMenu.Item>
                                    </>
                                  )}
                                </DropdownMenu.Content>
                              </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                          </div>
                        </div>
                      </article>
                    </Fragment>
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
                  data-chat-composer
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
                      aria-describedby={inputHintId}
                      value={draft}
                      onChange={(event) => updateDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing &&
                          event.nativeEvent.keyCode !== 229
                        ) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
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
                  <p
                    id={inputHintId}
                    className="text-connect-muted px-3 pb-2 text-xs"
                  >
                    Enterで送信 · Shift+Enterで改行
                  </p>
                </div>
              </form>
            )}
            {message && (
              <p
                role="status"
                aria-label="操作結果"
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
