"use client";

import {
  MoreHorizontal,
  ArrowLeft,
  FileText,
  ImageIcon,
  Link as LinkIcon,
  LoaderCircle,
  Paperclip,
  Plus,
  Reply,
  Send,
  Users,
  X,
} from "lucide-react";
import {
  Fragment,
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
  formatMessageTime,
} from "~/features/chat/components/chat-message";
import { DropdownMenu } from "radix-ui";
import { useChatEvents } from "~/features/chat/components/use-chat-events";
import { useMessageViewport } from "~/features/chat/components/use-message-viewport";
import { useMessageHistory } from "~/features/chat/components/use-message-history";
import { ChatConnectionStatus } from "~/features/chat/components/chat-connection-status";
import {
  getMessageSendAttempt,
  type MessageSendAttempt,
} from "~/features/chat/message-send-attempt";
import {
  createMessageEventQueue,
  updateMessagePages,
} from "~/features/chat/realtime-messages";
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

type PendingAttachment = {
  fileName: string;
  id: string;
  kind: "IMAGE" | "LINK" | "PDF";
  mimeType: string;
  size: number;
  url: string;
};

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
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ content: string; id: string }>();
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [urlDraft, setUrlDraft] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [message, setMessage] = useState<string>();
  const [reportingMessageId, setReportingMessageId] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);
  const utils = api.useUtils();
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const groups = api.group.list.useInfiniteQuery(
    {},
    {
      enabled: open,
      getNextPageParam: (page) => page.nextCursor,
      refetchInterval: isRealtimeConnected ? false : 5000,
    },
  );
  const groupList = useMemo(
    () => groups.data?.pages.flatMap((page) => page.groups) ?? [],
    [groups.data],
  );
  const draftRevision = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusDraftAfterMenu = useRef(false);
  const sendAttempts = useRef(new Map<string, MessageSendAttempt>());
  const eventQueue = useRef(createMessageEventQueue());
  const draftStorageKey =
    groups.data?.pages[0]?.currentUserId && selectedGroupId
      ? `connect:draft:${groups.data.pages[0].currentUserId}:group:${selectedGroupId}`
      : undefined;
  const activeDraftKeyRef = useRef(draftStorageKey);
  activeDraftKeyRef.current = draftStorageKey;
  const friends = api.chat.getFriends.useQuery(undefined, {
    enabled: open && isCreating,
  });
  const conversation = api.group.getConversation.useInfiniteQuery(
    { groupId: selectedGroupId ?? "" },
    {
      enabled: open && Boolean(selectedGroupId),
      getNextPageParam: (page) => page.nextCursor,
      refetchInterval: (query) =>
        !isRealtimeConnected && query.state.status !== "error" ? 5000 : false,
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
  const sendMessage = api.group.sendMessage.useMutation();
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

  const selectedGroup =
    groupList.find(({ id }) => id === selectedGroupId) ??
    (!conversation.isError ? conversation.data?.pages[0]?.group : undefined);
  const messages = useMemo(
    () =>
      !conversation.isError
        ? [...(conversation.data?.pages ?? [])]
            .reverse()
            .flatMap((page) => page.messages)
        : [],
    [conversation.data?.pages, conversation.isError],
  );
  const viewport = useMessageViewport({
    conversationKey: open ? (selectedGroupId ?? null) : null,
    latestMessageId: messages.at(-1)?.id,
    onReadLatest: () => undefined,
    unreadCount: 0,
  });
  const history = useMessageHistory({
    containerRef: viewport.containerRef,
    conversationKey: selectedGroupId ?? null,
    pageCount: conversation.data?.pages.length ?? 0,
    hasNextPage: conversation.hasNextPage,
    isFetching: conversation.isFetching,
    fetchNextPage: () => conversation.fetchNextPage(),
  });
  useChatEvents({
    enabled: open,
    onConnectionChange: setIsRealtimeConnected,
    onOpen: () => {
      void utils.group.list.invalidate();
      if (selectedGroupId)
        void utils.group.getConversation.invalidate({
          groupId: selectedGroupId,
        });
    },
    onEvent: (event) => {
      if (event.kind !== "group") return;
      void utils.group.list.invalidate();
      if (event.groupId !== selectedGroupId) return;
      const { groupId, messageId, change } = event;
      if (!messageId || !change) {
        void utils.group.getConversation.invalidate({ groupId });
        return;
      }
      void eventQueue
        .current(`${groupId}:${messageId}`, async () => {
          const message = await utils.group.getMessage.fetch(
            {
              groupId,
              messageId,
            },
            { staleTime: 0 },
          );
          if (!message) return;
          utils.group.getConversation.setInfiniteData({ groupId }, (current) =>
            current
              ? {
                  ...current,
                  pages: updateMessagePages(current.pages, message, change),
                }
              : current,
          );
        })
        .catch(() => {
          void utils.group.getConversation.invalidate({ groupId });
        });
    },
  });

  useEffect(() => {
    if (initialGroupId) setSelectedGroupId(initialGroupId);
  }, [initialGroupId]);

  useEffect(() => {
    if (selectedGroupId === undefined && groupList[0]) {
      setSelectedGroupId(groupList[0].id);
    }
  }, [groupList, selectedGroupId]);

  useEffect(() => {
    draftRevision.current += 1;
    setDraft(
      draftStorageKey ? (localStorage.getItem(draftStorageKey) ?? "") : "",
    );
    setReplyTo(undefined);
    setAttachments([]);
    setUrlDraft("");
    setShowUrlInput(false);
  }, [draftStorageKey]);

  const updateDraft = (value: string) => {
    draftRevision.current += 1;
    setDraft(value);
    if (!draftStorageKey) return;
    if (value) localStorage.setItem(draftStorageKey, value);
    else localStorage.removeItem(draftStorageKey);
  };

  const uploadFile = async (file: File) => {
    const targetDraftKey = draftStorageKey;
    if (!targetDraftKey) return;
    setMessage(undefined);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/attachments", {
        body: formData,
        method: "POST",
      });
      const result = (await response.json()) as {
        attachment?: PendingAttachment;
        message?: string;
      };
      if (activeDraftKeyRef.current !== targetDraftKey) return;
      if (!response.ok || !result.attachment) {
        throw new Error(result.message ?? "添付できませんでした");
      }
      setAttachments((current) => [...current, result.attachment!].slice(0, 4));
    } catch (error) {
      if (activeDraftKeyRef.current !== targetDraftKey) return;
      setMessage(
        error instanceof Error ? error.message : "添付できませんでした",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const addUrl = async () => {
    const targetDraftKey = draftStorageKey;
    if (!urlDraft.trim() || !targetDraftKey) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("url", urlDraft.trim());
      const response = await fetch("/api/attachments", {
        body: formData,
        method: "POST",
      });
      const result = (await response.json()) as {
        attachment?: PendingAttachment;
        message?: string;
      };
      if (activeDraftKeyRef.current !== targetDraftKey) return;
      if (!response.ok || !result.attachment) throw new Error(result.message);
      setAttachments((current) => [...current, result.attachment!].slice(0, 4));
      setUrlDraft("");
      setShowUrlInput(false);
    } catch (error) {
      if (activeDraftKeyRef.current !== targetDraftKey) return;
      setMessage(
        error instanceof Error ? error.message : "URLを追加できませんでした",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      !selectedGroupId ||
      sendMessage.isPending ||
      (!draft.trim() && attachments.length === 0)
    )
      return;
    const groupId = selectedGroupId;
    const targetKey = draftStorageKey;
    const revision = draftRevision.current;
    const payload = {
      attachmentIds: attachments.map(({ id }) => id),
      content: draft.trim() || "添付ファイル",
      replyToId: replyTo?.id,
    };
    const attempt = getMessageSendAttempt(sendAttempts.current.get(groupId), {
      ...payload,
      conversationId: groupId,
    });
    sendAttempts.current.set(groupId, attempt);
    setMessage(undefined);
    sendMessage.mutate(
      { ...payload, clientId: attempt.clientId, groupId },
      {
        onSuccess: () => {
          if (sendAttempts.current.get(groupId) === attempt)
            sendAttempts.current.delete(groupId);
          if (
            activeDraftKeyRef.current === targetKey &&
            draftRevision.current === revision
          ) {
            setDraft("");
            setReplyTo(undefined);
            setAttachments([]);
            if (targetKey) localStorage.removeItem(targetKey);
          }
          void utils.group.getConversation.invalidate({ groupId });
          void utils.group.list.invalidate();
        },
        onError: (error) => {
          if (activeDraftKeyRef.current === targetKey)
            setMessage(error.message);
        },
      },
    );
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
                    className="border-connect-ink/15 bg-connect-surface mt-2 min-h-11 w-full rounded-md border px-3"
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
                {groupList.map((group) => (
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
                {groups.hasNextPage && (
                  <button
                    type="button"
                    className="min-h-11 w-full rounded-md px-3 text-sm"
                    disabled={groups.isFetchingNextPage}
                    onClick={() => void groups.fetchNextPage()}
                  >
                    グループをさらに表示
                  </button>
                )}
                {groupList.length === 0 && (
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
            <ChatConnectionStatus isReconnecting={!isRealtimeConnected} />
            <div
              ref={viewport.containerRef}
              data-group-chat-viewport
              tabIndex={0}
              style={{ overflowAnchor: "none" }}
              onScroll={() => {
                viewport.handleScroll();
                history.handleScroll();
              }}
              onWheel={history.handleWheel}
              onKeyDown={history.handleKeyDown}
              onTouchStart={history.handleTouchStart}
              onTouchMove={history.handleTouchMove}
              className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4"
            >
              {conversation.hasNextPage && (
                <button
                  type="button"
                  onClick={() => void history.loadOlder()}
                  className="border-connect-ink/15 bg-connect-surface mx-auto mb-4 block min-h-10 rounded-md border px-3 text-sm font-semibold"
                >
                  過去のメッセージ
                </button>
              )}
              <div className="space-y-2">
                {messages.map((chatMessage, index) => {
                  const reactionGroups = groupReactions(chatMessage.reactions);
                  return (
                    <Fragment key={chatMessage.id}>
                      {(index === 0 ||
                        messages[index - 1]?.createdAt.toDateString() !==
                          chatMessage.createdAt.toDateString()) && (
                        <p className="text-connect-muted py-3 text-center text-xs">
                          {new Intl.DateTimeFormat("ja-JP", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            weekday: "short",
                          }).format(chatMessage.createdAt)}
                        </p>
                      )}
                      <article className="hover:bg-connect-surface group rounded-md p-2">
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
                            <time
                              className="text-connect-muted text-xs"
                              dateTime={chatMessage.createdAt.toISOString()}
                            >
                              {formatMessageTime(chatMessage.createdAt)}
                            </time>
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
                              className="hover:bg-connect-highlight flex h-11 w-11 items-center justify-center rounded-md"
                              aria-label="返信"
                            >
                              <Reply className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <DropdownMenu.Root>
                              <DropdownMenu.Trigger asChild>
                                <button
                                  type="button"
                                  aria-label="その他の操作"
                                  className="hover:bg-connect-highlight flex size-11 items-center justify-center rounded-md"
                                >
                                  <MoreHorizontal
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                </button>
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                  align="end"
                                  sideOffset={4}
                                  collisionPadding={8}
                                  className="border-connect-ink/15 bg-connect-paper text-connect-ink z-50 max-w-[calc(100vw-16px)] min-w-40 rounded-md border p-1 shadow-lg"
                                  onCloseAutoFocus={(event) => {
                                    if (focusDraftAfterMenu.current) {
                                      event.preventDefault();
                                      focusDraftAfterMenu.current = false;
                                      textareaRef.current?.focus();
                                    }
                                  }}
                                >
                                  <DropdownMenu.Item
                                    className="data-[highlighted]:bg-connect-highlight flex min-h-11 cursor-pointer items-center rounded px-3 outline-none"
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
                                      focusDraftAfterMenu.current = true;
                                    }}
                                  >
                                    引用
                                  </DropdownMenu.Item>
                                  <DropdownMenu.Item
                                    className="data-[highlighted]:bg-connect-highlight flex min-h-11 cursor-pointer items-center rounded px-3 outline-none"
                                    onSelect={() => {
                                      if (selectedGroupId)
                                        toggleSaved.mutate({
                                          groupId: selectedGroupId,
                                          messageId: chatMessage.id,
                                        });
                                    }}
                                  >
                                    {chatMessage.isSaved ? "保存解除" : "保存"}
                                  </DropdownMenu.Item>
                                  {chatMessage.senderId !==
                                    conversation.data?.pages[0]?.currentUser
                                      .id && (
                                    <DropdownMenu.Item
                                      className="data-[highlighted]:bg-connect-danger-soft text-connect-danger flex min-h-11 cursor-pointer items-center rounded px-3 outline-none"
                                      onSelect={() =>
                                        setReportingMessageId(chatMessage.id)
                                      }
                                    >
                                      通報
                                    </DropdownMenu.Item>
                                  )}
                                </DropdownMenu.Content>
                              </DropdownMenu.Portal>
                            </DropdownMenu.Root>
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
                    </Fragment>
                  );
                })}
                <div ref={viewport.endRef} />
              </div>
            </div>
            {selectedGroupId && (
              <form onSubmit={submit} className="p-3" noValidate>
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
                {attachments.length > 0 && (
                  <div className="bg-connect-surface border-connect-ink/15 flex flex-wrap gap-2 border-x border-t px-3 py-2">
                    {attachments.map((attachment) => (
                      <span
                        key={attachment.id}
                        className="bg-connect-paper border-connect-ink/15 inline-flex min-h-9 items-center gap-2 rounded-md border px-2 text-xs"
                      >
                        {attachment.kind === "IMAGE" ? (
                          <ImageIcon className="h-4 w-4" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                        {attachment.fileName}
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((current) =>
                              current.filter(({ id }) => id !== attachment.id),
                            )
                          }
                          aria-label="添付を外す"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {showUrlInput && (
                  <div className="border-connect-ink/15 bg-connect-surface flex gap-2 border-x border-t p-2">
                    <input
                      type="url"
                      value={urlDraft}
                      onChange={(event) => setUrlDraft(event.target.value)}
                      placeholder="https://…"
                      className="border-connect-ink/15 bg-connect-paper min-h-10 min-w-0 flex-1 rounded-md border px-3"
                    />
                    <button
                      type="button"
                      onClick={() => void addUrl()}
                      className="bg-connect-action text-connect-surface min-h-10 rounded-md px-3 text-sm font-bold"
                    >
                      追加
                    </button>
                  </div>
                )}
                <div
                  data-chat-composer
                  className={`border-connect-ink/15 bg-connect-surface flex items-end gap-2 border p-2 ${replyTo || attachments.length > 0 || showUrlInput ? "rounded-b-md" : "rounded-md"}`}
                >
                  <label
                    className="hover:bg-connect-highlight flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md"
                    aria-label="ファイルを添付"
                  >
                    {isUploading ? (
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                    ) : (
                      <Paperclip className="h-5 w-5" />
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                      className="sr-only"
                      disabled={isUploading || attachments.length >= 4}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadFile(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowUrlInput((value) => !value)}
                    className="hover:bg-connect-highlight flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
                    aria-label="URLカード"
                  >
                    <LinkIcon className="h-5 w-5" />
                  </button>
                  <textarea
                    ref={textareaRef}
                    data-chat-input
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
                    value={draft}
                    onChange={(event) => updateDraft(event.target.value)}
                    maxLength={1000}
                    rows={1}
                    placeholder="グループへメッセージ"
                    className="max-h-32 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={
                      sendMessage.isPending ||
                      (!draft.trim() && attachments.length === 0)
                    }
                    className="bg-connect-action text-connect-surface hover:bg-connect-action-hover flex h-10 w-10 shrink-0 items-center justify-center rounded-md disabled:opacity-50"
                    aria-label="送信"
                  >
                    <Send className="h-5 w-5" />
                  </button>
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
