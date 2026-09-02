"use client";

import {
  Ban,
  Bookmark,
  Check,
  ChevronDown,
  Copy,
  Ellipsis,
  FileText,
  Flag,
  Hash,
  Inbox,
  LogOut,
  Menu,
  MessageCircle,
  Link as LinkIcon,
  Pencil,
  Pin,
  Plus,
  Quote,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings,
  Shuffle,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ChatQueryError } from "~/features/chat/components/chat-query-error";
import { GlobalSearchDialog } from "~/features/chat/components/global-search-dialog";
import {
  MessageAttachmentPicker,
  type PendingAttachment,
} from "~/features/chat/components/message-attachment-picker";
import {
  ExternalLinkDialog,
  PinnedMessagesDialog,
} from "~/features/chat/components/chat-dialogs";
import {
  Avatar,
  formatMessageTime,
  getDisplayName,
  getServerDisplayName,
  MessageText,
  NewMessagesSeparator,
  PendingMessageRow,
  ProfileAvatar,
} from "~/features/chat/components/chat-message";
import { ServerMemberList } from "~/features/chat/components/server-member-list";
import { useMessageViewport } from "~/features/chat/components/use-message-viewport";
import { matchesFriendSearch } from "~/features/chat/friend-search";
import {
  MATCHING_SAFETY_NOTICE,
  MATCHING_TOPICS,
  SAFETY_RESOURCES,
  type MatchingTopic,
} from "~/features/chat/matching-prompts";
import { shouldGroupMessage } from "~/features/chat/message-grouping";
import { groupReactions } from "~/features/chat/reaction-groups";
import { FriendPanel } from "~/features/friend/components/friend-panel";
import { GroupDmDialog } from "~/features/group/components/group-dm-dialog";
import {
  getPresenceDisplayLabel,
  getPresenceDotClassName,
} from "~/features/profile/presence";
import { PresenceStatusMenu } from "~/features/profile/components/presence-status-menu";
import { ProfileSettingsDialog } from "~/features/profile/components/profile-settings-dialog";
import { ServerRail } from "~/features/server/components/server-rail";
import { getRealtimeUnreadCount } from "~/features/server/server/server-overview";
import {
  canManageServer,
  canManageServerChannels,
  canManageServerReports,
  canReactToServerMessage,
  canSendServerMessage,
  type ServerMemberRole,
} from "~/features/server/server/message-permissions";
import { type RouterOutputs, api } from "~/trpc/react";

type ChatFriend = RouterOutputs["chat"]["getFriends"][number];
type ChatGroup = RouterOutputs["group"]["list"]["groups"][number];
type ChatServerMembership =
  RouterOutputs["server"]["getOverview"]["memberships"][number];
type ChatEventPayload =
  | { kind: "direct"; userIds: string[] }
  | { groupId: string; kind: "group"; userIds: string[] }
  | {
      change: "created" | "deleted" | "updated";
      channelId: string | null;
      kind: "server";
      senderId: string;
      serverId: string;
    }
  | {
      isTyping: boolean;
      kind: "typing";
      senderId: string;
      userIds: string[];
      userName: string;
    };
type FriendChatPanelProps = {
  initialSearchOpen?: boolean;
  initialServerId?: string;
};

function getGroupDisplayName(group: ChatGroup) {
  const customName = group.name?.trim();
  if (customName) return customName;

  const currentUserId = group.myMembership?.user.id;
  return (
    group.members
      .filter(({ user }) => user.id !== currentUserId)
      .slice(0, 3)
      .map(({ user }) => getDisplayName(user))
      .join("、") || "グループDM"
  );
}

function getGroupPreview(group: ChatGroup) {
  const content = group.lastMessage?.content.trim();
  if (content?.length) return content;
  return `${group.members.length}人の会話`;
}
type EditingMessage =
  | { content: string; kind: "direct"; messageId: string }
  | { content: string; kind: "server"; messageId: string };
type MessageContextMenu =
  | { kind: "direct"; messageId: string; x: number; y: number }
  | { kind: "server"; messageId: string; x: number; y: number };
type ReportReason = "HARASSMENT" | "OTHER" | "SELF_HARM" | "SPAM";
type MatchingRating = "NEGATIVE" | "NEUTRAL" | "POSITIVE";
type ServerCategory =
  | "COMMUNITY"
  | "GAMES"
  | "STUDY"
  | "HOBBIES"
  | "WELLBEING"
  | "OTHER";
type ReportTarget = {
  content: string;
  messageId: string;
  messageKind: "DIRECT" | "SERVER";
};
type ProfileContextUser = {
  name?: string | null;
  userId: string;
};
type ProfileContextMenu = ProfileContextUser & {
  x: number;
  y: number;
};
type PendingMessage = {
  clientId: string;
  content: string;
  createdAt: Date;
  messageId?: string;
  status: "confirmed" | "pending";
};
type PendingDirectMessage = PendingMessage & { friendId: string };
type PendingServerMessage = PendingMessage & {
  channelId: string;
  serverId: string;
};

type ReplyTarget = {
  content: string;
  id: string;
  kind: "direct" | "server";
};

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

function shouldGroupPendingMessage(
  message: PendingMessage,
  previousPendingMessage: PendingMessage | undefined,
  previousMessage: { createdAt: Date; senderId: string } | undefined,
  senderId: string,
) {
  return shouldGroupMessage(
    { createdAt: message.createdAt, senderId },
    previousPendingMessage
      ? { createdAt: previousPendingMessage.createdAt, senderId }
      : previousMessage,
  );
}

const reportReasons: { label: string; value: ReportReason }[] = [
  { label: "嫌がらせ", value: "HARASSMENT" },
  { label: "自傷・自殺に関する内容", value: "SELF_HARM" },
  { label: "スパム", value: "SPAM" },
  { label: "その他", value: "OTHER" },
];

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "処理に失敗しました";
}

function handleContextMenuKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  closeMenu: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeMenu();
    return;
  }

  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not(:disabled)',
    ),
  ];
  if (items.length === 0) return;

  event.preventDefault();
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? currentIndex < 0
            ? 0
            : (currentIndex + 1) % items.length
          : currentIndex < 0
            ? items.length - 1
            : (currentIndex - 1 + items.length) % items.length;
  items[nextIndex]?.focus();
}

function FriendListItem({
  item,
  onProfileContextMenu,
  onSelect,
  selected,
}: {
  item: ChatFriend;
  onProfileContextMenu: (
    event: MouseEvent<HTMLElement>,
    user: ProfileContextUser,
  ) => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const lastMessage = item.lastMessage;
  const isMine = lastMessage?.senderId === item.currentUserId;
  const preview = lastMessage
    ? `${isMine ? "あなた: " : ""}${lastMessage.content}`
    : "まだメッセージはありません";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition ${
        selected
          ? "bg-connect-ink text-connect-paper"
          : "text-connect-muted hover:bg-connect-surface hover:text-connect-ink"
      }`}
    >
      <div
        className="relative shrink-0"
        onContextMenu={(event) => onProfileContextMenu(event, item.friend)}
      >
        <Avatar
          user={item.friend}
          className="border-connect-ink/10 h-10 w-10 rounded-full border"
        />
        {item.unreadCount > 0 && (
          <span className="border-connect-navigation bg-connect-danger text-connect-surface absolute -right-1 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 px-1 text-[11px] font-semibold">
            {item.unreadCount}
          </span>
        )}
      </div>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {getDisplayName(item.friend)}
        </span>
        <span className="text-connect-muted block truncate text-xs">
          {preview}
        </span>
      </span>
    </button>
  );
}

export function FriendChatPanel({
  initialSearchOpen = false,
  initialServerId,
}: FriendChatPanelProps) {
  const utils = api.useUtils();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(
    initialServerId ?? null,
  );
  const [selectedServerChannelId, setSelectedServerChannelId] = useState<
    string | null
  >(null);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [isNavigationOpen, setIsNavigationOpen] = useState(!initialServerId);
  const [friendSearch, setFriendSearch] = useState("");
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [isMatchingOpen, setIsMatchingOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] =
    useState(initialSearchOpen);
  const [isGroupDmOpen, setIsGroupDmOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const [matchingTopic, setMatchingTopic] = useState<MatchingTopic>("CASUAL");
  const [matchingState, setMatchingState] = useState<"idle" | "waiting">(
    "idle",
  );
  const [matchingMessage, setMatchingMessage] = useState<string | null>(null);
  const [matchingSafetyAccepted, setMatchingSafetyAccepted] = useState(false);
  const [draft, setDraft] = useState("");
  const [serverDraft, setServerDraft] = useState("");
  const [directAttachments, setDirectAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [serverAttachments, setServerAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [newChannelName, setNewChannelName] = useState("");
  const [isNewChannelFormOpen, setIsNewChannelFormOpen] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState("");
  const [channelContextMenu, setChannelContextMenu] = useState<{
    channelId: string;
    x: number;
    y: number;
  } | null>(null);
  const [messageContextMenu, setMessageContextMenu] =
    useState<MessageContextMenu | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [profileContextMenu, setProfileContextMenu] =
    useState<ProfileContextMenu | null>(null);
  const [editingMessage, setEditingMessage] = useState<EditingMessage | null>(
    null,
  );
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);
  const [isServerReportsOpen, setIsServerReportsOpen] = useState(false);
  const [isPinnedMessagesOpen, setIsPinnedMessagesOpen] = useState(false);
  const [isMemberListOpen, setIsMemberListOpen] = useState(false);
  const [pendingExternalLink, setPendingExternalLink] = useState<string | null>(
    null,
  );
  const [serverNameDraft, setServerNameDraft] = useState("");
  const [serverVisibilityDraft, setServerVisibilityDraft] = useState<
    "PRIVATE" | "PUBLIC"
  >("PRIVATE");
  const [serverCategoryDraft, setServerCategoryDraft] = useState<
    ServerCategory | ""
  >("");
  const [serverTagsDraft, setServerTagsDraft] = useState("");
  const [serverIconFile, setServerIconFile] = useState<File | null>(null);
  const [serverSettingsMessage, setServerSettingsMessage] = useState<
    string | null
  >(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("HARASSMENT");
  const [reportDetails, setReportDetails] = useState("");
  const [moderationNotice, setModerationNotice] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [pendingDirectMessages, setPendingDirectMessages] = useState<
    PendingDirectMessage[]
  >([]);
  const [pendingServerMessages, setPendingServerMessages] = useState<
    PendingServerMessage[]
  >([]);
  const [typingUserName, setTypingUserName] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const typingResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const localTypingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastTypingSentAtRef = useRef(0);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const friends = api.chat.getFriends.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.status === "error"
        ? false
        : matchingState === "waiting" || !isRealtimeConnected
          ? 5000
          : 30000,
  });
  const groupConversations = api.group.list.useQuery();
  const filteredFriends = useMemo(
    () =>
      (friends.data ?? []).filter((item) =>
        matchesFriendSearch(item.friend, friendSearch),
      ),
    [friendSearch, friends.data],
  );
  const matchingStatus = api.chat.getMatchingStatus.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.status === "error"
        ? false
        : matchingState === "waiting"
          ? 3000
          : false,
  });
  const pendingMatchFeedback = api.chat.getPendingMatchFeedback.useQuery();
  const serverOverview = api.server.getOverview.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.status === "error"
        ? false
        : isRealtimeConnected
          ? 60000
          : 15000,
  });
  const selectedServer = useMemo(() => {
    return (
      serverOverview.data?.memberships.find(
        (membership) => membership.server.id === selectedServerId,
      ) ?? null
    );
  }, [serverOverview.data?.memberships, selectedServerId]);
  const currentServerUser = serverOverview.data?.currentUser ?? null;
  const selectedServerChannel = useMemo(() => {
    if (!selectedServer) return null;

    return (
      selectedServer.server.channels.find(
        (channel) => channel.id === selectedServerChannelId,
      ) ??
      selectedServer.server.channels[0] ??
      null
    );
  }, [selectedServer, selectedServerChannelId]);
  const serverMembers = api.server.getMembers.useQuery(
    { serverId: selectedServerId ?? "" },
    {
      enabled: Boolean(selectedServerId),
      refetchInterval: (query) =>
        !isMemberListOpen || query.state.status === "error"
          ? false
          : isRealtimeConnected
            ? 60000
            : 15000,
    },
  );
  const selectedServerMembers = useMemo(() => {
    if (!serverMembers.data) return [];

    return [...serverMembers.data].sort((memberA, memberB) =>
      getServerDisplayName(memberA).localeCompare(
        getServerDisplayName(memberB),
        "ja",
      ),
    );
  }, [serverMembers.data]);
  const isSelectedServerOwner = selectedServer?.role === "OWNER";
  const canManageSelectedServer = canManageServer(selectedServer?.role);
  const canManageSelectedChannels = canManageServerChannels(
    selectedServer?.role,
  );
  const canManageSelectedReports = canManageServerReports(selectedServer?.role);
  const canReactToSelectedServerMessages = canReactToServerMessage(
    selectedServer?.role,
  );
  const canSendSelectedServerMessages = canSendServerMessage(
    selectedServer?.role,
  );
  const serverReports = api.moderation.getServerReports.useQuery(
    { serverId: selectedServerId ?? "" },
    {
      enabled: Boolean(
        isServerReportsOpen && canManageSelectedReports && selectedServerId,
      ),
    },
  );
  const submitMessageReport = api.moderation.reportMessage.useMutation({
    onMutate: () => setModerationNotice(null),
    onSuccess: () => {
      setReportTarget(null);
      setModerationNotice({
        kind: "success",
        text: "メッセージの通報を受け付けました",
      });
    },
    onError: (error) =>
      setModerationNotice({ kind: "error", text: getErrorMessage(error) }),
  });
  const markServerReportReviewed =
    api.moderation.markServerReportReviewed.useMutation({
      onMutate: () => setModerationNotice(null),
      onSuccess: async (_result, variables) => {
        setModerationNotice({
          kind: "success",
          text: "通報を確認済みにしました",
        });
        await utils.moderation.getServerReports.invalidate({
          serverId: variables.serverId,
        });
      },
      onError: (error) =>
        setModerationNotice({ kind: "error", text: getErrorMessage(error) }),
    });
  const channelContextTarget = channelContextMenu
    ? selectedServer?.server.channels.find(
        (channel) => channel.id === channelContextMenu.channelId,
      )
    : undefined;
  const serverConversation = api.server.getConversation.useInfiniteQuery(
    {
      channelId: selectedServerChannel?.id,
      serverId: selectedServerId ?? "",
    },
    {
      enabled: Boolean(selectedServerId && selectedServerChannel?.id),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchInterval: (query) =>
        query.state.status === "error"
          ? false
          : selectedServerId && selectedServerChannel?.id
            ? isRealtimeConnected
              ? 30000
              : 3000
            : false,
    },
  );
  const serverConversationData = serverConversation.data?.pages[0] ?? null;
  const serverMessages = useMemo(
    () =>
      serverConversation.data
        ? [...serverConversation.data.pages]
            .reverse()
            .flatMap((page) => page.messages)
        : [],
    [serverConversation.data],
  );

  useEffect(() => {
    setSelectedServerId(initialServerId ?? null);
    setIsNavigationOpen(!initialServerId);
    if (initialServerId) {
      setSelectedFriendId(null);
    }
  }, [initialServerId]);

  useEffect(() => {
    if (selectedServerId || isFriendsOpen || isMatchingOpen) return;

    const data = friends.data;
    if (!data?.length) {
      setSelectedFriendId(null);
      return;
    }

    if (
      !selectedFriendId ||
      !data.some((item) => item.friend.id === selectedFriendId)
    ) {
      setSelectedFriendId(data[0]?.friend.id ?? null);
    }
  }, [
    friends.data,
    isFriendsOpen,
    isMatchingOpen,
    selectedFriendId,
    selectedServerId,
  ]);

  const conversation = api.chat.getConversation.useInfiniteQuery(
    { friendId: selectedFriendId ?? "" },
    {
      enabled: Boolean(selectedFriendId),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchInterval: (query) =>
        query.state.status === "error"
          ? false
          : selectedFriendId
            ? isRealtimeConnected
              ? 30000
              : 3000
            : false,
    },
  );

  const hasChatQueryError =
    friends.isError ||
    matchingStatus.isError ||
    serverOverview.isError ||
    (Boolean(selectedServerId) && serverMembers.isError) ||
    (Boolean(selectedServerId && selectedServerChannel?.id) &&
      serverConversation.isError) ||
    (Boolean(selectedFriendId) && conversation.isError);

  const retryChatQueries = async () => {
    const requests: Promise<unknown>[] = [
      friends.refetch(),
      matchingStatus.refetch(),
      serverOverview.refetch(),
    ];

    if (selectedServerId && selectedServerChannel?.id) {
      requests.push(serverConversation.refetch());
    }

    if (selectedServerId) {
      requests.push(serverMembers.refetch());
    }

    if (selectedFriendId) {
      requests.push(conversation.refetch());
    }

    await Promise.allSettled(requests);
  };

  const directConversation = conversation.data?.pages[0] ?? null;
  const directMessages = useMemo(
    () =>
      conversation.data
        ? [...conversation.data.pages]
            .reverse()
            .flatMap((page) => page.messages)
        : [],
    [conversation.data],
  );
  const selectedFriendContact = useMemo(
    () =>
      friends.data?.find((item) => item.friend.id === selectedFriendId) ?? null,
    [friends.data, selectedFriendId],
  );
  const activeDirectPendingMessages = useMemo(
    () =>
      pendingDirectMessages.filter(
        (pendingMessage) => pendingMessage.friendId === selectedFriendId,
      ),
    [pendingDirectMessages, selectedFriendId],
  );
  const activeServerPendingMessages = useMemo(
    () =>
      pendingServerMessages.filter(
        (pendingMessage) =>
          pendingMessage.serverId === selectedServerId &&
          pendingMessage.channelId === selectedServerChannel?.id,
      ),
    [pendingServerMessages, selectedServerChannel?.id, selectedServerId],
  );
  const hasDirectMessages =
    directMessages.length > 0 || activeDirectPendingMessages.length > 0;
  const hasServerMessages =
    serverMessages.length > 0 || activeServerPendingMessages.length > 0;
  const latestDirectMessageId = directMessages.at(-1)?.id;
  const latestServerMessageId = serverMessages.at(-1)?.id;
  const directUnreadMessages = directConversation
    ? directMessages.filter(
        (chatMessage) =>
          chatMessage.receiverId === directConversation.currentUserId &&
          chatMessage.readAt === null,
      )
    : [];
  const serverReadAt = serverConversationData?.readAt?.getTime() ?? -1;
  const serverUnreadMessages = serverConversationData
    ? serverMessages.filter(
        (chatMessage) =>
          chatMessage.senderId !== serverConversationData.currentUser.id &&
          chatMessage.createdAt.getTime() > serverReadAt,
      )
    : [];
  const directUnreadCount = Math.max(
    selectedFriendContact?.unreadCount ?? 0,
    directUnreadMessages.length,
  );
  const serverUnreadCount = Math.max(
    selectedServerChannel?.unreadCount ?? 0,
    serverUnreadMessages.length,
  );
  const firstDirectUnreadMessageId = directUnreadMessages[0]?.id;
  const firstServerUnreadMessageId = serverUnreadMessages[0]?.id;

  const { mutateAsync: markDirectConversationRead } =
    api.chat.markConversationRead.useMutation({
      onSuccess: (result, variables) => {
        void utils.chat.getFriends.invalidate();
        utils.chat.getConversation.setInfiniteData(
          { friendId: variables.friendId },
          (data) =>
            data
              ? {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    messages: page.messages.map((chatMessage) =>
                      chatMessage.receiverId === page.currentUserId &&
                      chatMessage.createdAt <= result.readThrough
                        ? { ...chatMessage, readAt: new Date() }
                        : chatMessage,
                    ),
                  })),
                }
              : data,
        );
      },
    });
  const { mutateAsync: markServerChannelRead } =
    api.server.markChannelRead.useMutation({
      onSuccess: (result, variables) => {
        utils.server.getOverview.setData(undefined, (overview) => {
          if (!overview) return overview;

          return {
            ...overview,
            memberships: overview.memberships.map((membership) => ({
              ...membership,
              server: {
                ...membership.server,
                channels: membership.server.channels.map((channel) =>
                  channel.id === variables.channelId
                    ? { ...channel, unreadCount: 0 }
                    : channel,
                ),
              },
            })),
          };
        });
        utils.server.getConversation.setInfiniteData(
          {
            channelId: variables.channelId,
            serverId: variables.serverId,
          },
          (data) =>
            data
              ? {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    readAt: result.readThrough,
                  })),
                }
              : data,
        );
      },
    });

  const markLatestMessageRead = useCallback(async () => {
    if (
      selectedServerId &&
      selectedServerChannel?.id &&
      latestServerMessageId
    ) {
      await markServerChannelRead({
        channelId: selectedServerChannel.id,
        messageId: latestServerMessageId,
        serverId: selectedServerId,
      });
      return;
    }

    if (selectedFriendId && latestDirectMessageId) {
      await markDirectConversationRead({
        friendId: selectedFriendId,
        messageId: latestDirectMessageId,
      });
    }
  }, [
    latestDirectMessageId,
    latestServerMessageId,
    markDirectConversationRead,
    markServerChannelRead,
    selectedFriendId,
    selectedServerChannel?.id,
    selectedServerId,
  ]);
  const messageViewport = useMessageViewport({
    conversationKey: selectedServerId
      ? `server:${selectedServerId}:${selectedServerChannel?.id ?? ""}`
      : selectedFriendId
        ? `direct:${selectedFriendId}`
        : null,
    firstUnreadMessageId: selectedServerId
      ? firstServerUnreadMessageId
      : firstDirectUnreadMessageId,
    latestMessageId: selectedServerId
      ? (activeServerPendingMessages.at(-1)?.clientId ?? latestServerMessageId)
      : (activeDirectPendingMessages.at(-1)?.clientId ?? latestDirectMessageId),
    onReadLatest: markLatestMessageRead,
    unreadCount: selectedServerId ? serverUnreadCount : directUnreadCount,
  });

  useEffect(() => {
    const loadedIds = new Set(directMessages.map(({ id }) => id));
    setPendingDirectMessages((messages) => {
      const next = messages.filter(
        ({ messageId }) => !messageId || !loadedIds.has(messageId),
      );
      return next.length === messages.length ? messages : next;
    });
  }, [directMessages]);

  useEffect(() => {
    const loadedIds = new Set(serverMessages.map(({ id }) => id));
    setPendingServerMessages((messages) => {
      const next = messages.filter(
        ({ messageId }) => !messageId || !loadedIds.has(messageId),
      );
      return next.length === messages.length ? messages : next;
    });
  }, [serverMessages]);

  useEffect(() => {
    if (!selectedServer) {
      setSelectedServerChannelId(null);
      setEditingChannelId(null);
      setEditingChannelName("");
      setNewChannelName("");
      setIsNewChannelFormOpen(false);
      setChannelContextMenu(null);
      return;
    }

    if (
      !selectedServerChannelId ||
      !selectedServer.server.channels.some(
        (channel) => channel.id === selectedServerChannelId,
      )
    ) {
      setSelectedServerChannelId(selectedServer.server.channels[0]?.id ?? null);
    }
  }, [selectedServer, selectedServerChannelId]);

  useEffect(() => {
    if (!channelContextMenu) return;

    const closeMenu = () => setChannelContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [channelContextMenu]);

  useEffect(() => {
    if (!messageContextMenu && !profileContextMenu) return;

    const closeMenu = () => {
      setMessageContextMenu(null);
      setProfileContextMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [messageContextMenu, profileContextMenu]);

  useEffect(() => {
    if (!channelContextMenu && !messageContextMenu && !profileContextMenu) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      contextMenuRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [channelContextMenu, messageContextMenu, profileContextMenu]);

  useEffect(() => {
    setMessageContextMenu(null);
    setProfileContextMenu(null);
    setEditingMessage(null);
    setIsPinnedMessagesOpen(false);
    setIsMemberListOpen(false);
  }, [selectedFriendId, selectedServerChannel?.id, selectedServerId]);

  const selectedFriend = useMemo(() => {
    return directConversation?.friend ?? selectedFriendContact?.friend ?? null;
  }, [directConversation?.friend, selectedFriendContact?.friend]);
  const privateMatchFeedback =
    pendingMatchFeedback.data?.friend.id === selectedFriendId
      ? pendingMatchFeedback.data
      : null;
  const canSendDirectMessage =
    directConversation?.canSend ??
    Boolean(
      selectedFriendContact?.isFriend && !selectedFriendContact.isBlocked,
    );
  const { mutate: publishTyping } = api.chat.setTyping.useMutation();

  useEffect(() => {
    const events = new EventSource("/api/chat/events");
    events.onopen = () => {
      setIsRealtimeConnected(true);
      void utils.chat.getFriends.invalidate();
      void utils.server.getOverview.invalidate();
      if (selectedFriendId) {
        void utils.chat.getConversation.invalidate({
          friendId: selectedFriendId,
        });
      }
      if (selectedServerId && selectedServerChannel?.id) {
        void utils.server.getConversation.invalidate({
          channelId: selectedServerChannel.id,
          serverId: selectedServerId,
        });
      }
      if (selectedServerId) {
        void utils.server.getMembers.invalidate({
          serverId: selectedServerId,
        });
      }
    };
    events.onerror = () => setIsRealtimeConnected(false);
    const handleChatEvent = (event: MessageEvent<string>) => {
      let payload: ChatEventPayload;

      try {
        payload = JSON.parse(event.data) as ChatEventPayload;
      } catch {
        return;
      }

      if (payload.kind === "direct") {
        void utils.chat.getFriends.invalidate();
        if (selectedFriendId && payload.userIds.includes(selectedFriendId)) {
          void utils.chat.getConversation.invalidate({
            friendId: selectedFriendId,
          });
        }
        return;
      }

      if (payload.kind === "server") {
        const isSelectedChannel =
          payload.serverId === selectedServerId &&
          (payload.channelId === selectedServerChannel?.id ||
            (payload.channelId === null &&
              selectedServerChannel?.name === "general"));

        if (isSelectedChannel && selectedServerChannel?.id) {
          void utils.server.getConversation.invalidate({
            channelId: selectedServerChannel.id,
            serverId: payload.serverId,
          });
        }
        if (payload.change === "deleted" && !isSelectedChannel) {
          void utils.server.getOverview.invalidate();
          return;
        }
        if (payload.change === "created") {
          utils.server.getOverview.setData(undefined, (overview) => {
            if (!overview) return overview;

            const isMine = payload.senderId === overview.currentUser.id;
            return {
              ...overview,
              memberships: overview.memberships.map((membership) =>
                membership.server.id !== payload.serverId
                  ? membership
                  : {
                      ...membership,
                      server: {
                        ...membership.server,
                        channels: membership.server.channels.map((channel) => {
                          const isEventChannel =
                            payload.channelId === channel.id ||
                            (payload.channelId === null &&
                              channel.name === "general");

                          return isEventChannel
                            ? {
                                ...channel,
                                unreadCount: getRealtimeUnreadCount(
                                  channel.unreadCount,
                                  { change: payload.change, isMine },
                                  isSelectedChannel,
                                ),
                              }
                            : channel;
                        }),
                      },
                    },
              ),
            };
          });
        }
        return;
      }

      if (payload.kind === "group") {
        void utils.group.list.invalidate();
        return;
      }

      if (payload.senderId !== selectedFriendId) return;
      if (typingResetTimerRef.current) {
        clearTimeout(typingResetTimerRef.current);
      }

      if (payload.isTyping) {
        setTypingUserName(payload.userName);
        typingResetTimerRef.current = setTimeout(() => {
          setTypingUserName(null);
        }, 12_000);
      } else {
        setTypingUserName(null);
      }
    };
    events.addEventListener("chat", handleChatEvent as EventListener);

    return () => {
      events.close();
      setIsRealtimeConnected(false);
      if (typingResetTimerRef.current) {
        clearTimeout(typingResetTimerRef.current);
      }
      setTypingUserName(null);
    };
  }, [
    selectedFriendId,
    selectedServerChannel?.id,
    selectedServerChannel?.name,
    selectedServerId,
    utils.chat.getConversation,
    utils.chat.getFriends,
    utils.group.list,
    utils.server.getConversation,
    utils.server.getMembers,
    utils.server.getOverview,
  ]);

  const broadcastTyping = useCallback(
    (isTyping: boolean) => {
      if (!canSendDirectMessage || !selectedFriendId) return;
      publishTyping({ friendId: selectedFriendId, isTyping });
    },
    [canSendDirectMessage, publishTyping, selectedFriendId],
  );

  useEffect(() => {
    return () => {
      if (localTypingStopTimerRef.current) {
        clearTimeout(localTypingStopTimerRef.current);
      }
      if (lastTypingSentAtRef.current > 0) {
        broadcastTyping(false);
      }
      lastTypingSentAtRef.current = 0;
    };
  }, [broadcastTyping]);

  const openDirectFriend = useCallback((friendId: string) => {
    setIsNavigationOpen(false);
    setSelectedServerId(null);
    setSelectedServerChannelId(null);
    setIsFriendsOpen(false);
    setIsMatchingOpen(false);
    setEditingChannelId(null);
    setEditingChannelName("");
    setNewChannelName("");
    setIsNewChannelFormOpen(false);
    setChannelContextMenu(null);
    setSelectedFriendId(friendId);
    setServerMessage(null);
  }, []);

  useEffect(() => {
    setDraft(
      selectedFriendId
        ? (localStorage.getItem(`connect:draft:direct:${selectedFriendId}`) ??
            "")
        : "",
    );
  }, [selectedFriendId]);

  useEffect(() => {
    setDirectAttachments([]);
  }, [selectedFriendId]);

  useEffect(() => {
    setServerDraft(
      selectedServerChannel?.id
        ? (localStorage.getItem(
            `connect:draft:server:${selectedServerChannel.id}`,
          ) ?? "")
        : "",
    );
  }, [selectedServerChannel?.id]);

  useEffect(() => {
    setServerAttachments([]);
  }, [selectedServerChannel?.id]);

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (selectedFriendId) {
      const key = `connect:draft:direct:${selectedFriendId}`;
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    }

    if (!value.trim()) {
      if (localTypingStopTimerRef.current) {
        clearTimeout(localTypingStopTimerRef.current);
      }
      lastTypingSentAtRef.current = 0;
      broadcastTyping(false);
      return;
    }

    const now = Date.now();
    if (now - lastTypingSentAtRef.current >= 10_000) {
      lastTypingSentAtRef.current = now;
      broadcastTyping(true);
    }

    if (localTypingStopTimerRef.current) {
      clearTimeout(localTypingStopTimerRef.current);
    }

    localTypingStopTimerRef.current = setTimeout(() => {
      lastTypingSentAtRef.current = 0;
      broadcastTyping(false);
    }, 1600);
  };

  const handleServerDraftChange = (value: string) => {
    setServerDraft(value);
    if (!selectedServerChannel?.id) return;
    const key = `connect:draft:server:${selectedServerChannel.id}`;
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  };

  const cancelMatching = api.chat.cancelMatching.useMutation({
    onSuccess: async () => {
      await utils.chat.getMatchingStatus.invalidate();
    },
    onError: (error) => setMatchingMessage(getErrorMessage(error)),
  });

  const submitMatchRating = api.chat.submitMatchRating.useMutation({
    onSuccess: async () => {
      setMessage("評価を送信しました。内容は誰にも表示されません。");
      await utils.chat.getPendingMatchFeedback.invalidate();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const submitConversationAnalysisConsent =
    api.chat.submitConversationAnalysisConsent.useMutation({
      onSuccess: async () => {
        setMessage("設定を保存しました。");
        await utils.chat.getPendingMatchFeedback.invalidate();
      },
      onError: (error) => setMessage(getErrorMessage(error)),
    });

  const confirmMatchingSafety = api.chat.confirmMatchingSafety.useMutation({
    onError: (error) => setMatchingMessage(getErrorMessage(error)),
  });

  const matchRandom = api.chat.matchRandom.useMutation({
    onSuccess: async (result) => {
      if (result.status === "matched") {
        if (result.matchId) {
          await confirmMatchingSafety.mutateAsync({
            consent: true,
            matchId: result.matchId,
          });
        }
        openDirectFriend(result.friend.id);
        setMatchingSafetyAccepted(false);
        sessionStorage.removeItem("connect:matching-safety-confirmed");
        setMatchingState("idle");
        setMatchingMessage(
          `${getDisplayName(result.friend)}さんとマッチしました`,
        );
        await Promise.all([
          utils.chat.getFriends.invalidate(),
          utils.chat.getConversation.invalidate({ friendId: result.friend.id }),
          utils.chat.getPendingMatchFeedback.invalidate(),
        ]);
        cancelMatching.mutate();
        return;
      }

      setMatchingState("waiting");
      setMatchingMessage("同じ話題の相手を探しています...");
      await utils.chat.getMatchingStatus.invalidate();
    },
    onError: (error) => setMatchingMessage(getErrorMessage(error)),
  });

  const blockUser = api.friend.blockUser.useMutation({
    onSuccess: async (result) => {
      setProfileContextMenu(null);
      if (selectedFriendId === result.blockedId) {
        setSelectedFriendId(null);
      }
      await Promise.all([
        utils.chat.getConversation.invalidate(),
        utils.chat.getFriends.invalidate(),
        utils.chat.getMatchingStatus.invalidate(),
        utils.friend.getOverview.invalidate(),
        utils.profile.getByUserId.invalidate(),
        utils.server.getConversation.invalidate(),
        utils.server.getOverview.invalidate(),
      ]);
    },
    onError: (error) => {
      const errorMessage = getErrorMessage(error);
      if (selectedServerId) {
        setServerMessage(errorMessage);
      } else {
        setMessage(errorMessage);
      }
    },
  });

  useEffect(() => {
    const status = matchingStatus.data;
    if (!status) {
      return;
    }

    if (status.status === "waiting" && matchingState === "idle") {
      setMatchingTopic(status.topic);
      setMatchingState("waiting");
      setIsNavigationOpen(false);
      setIsMatchingOpen(true);
      setMatchingMessage("同じ話題の相手を探しています...");
      return;
    }

    if (status.status === "idle" && matchingState === "waiting") {
      setMatchingState("idle");
      setMatchingMessage(null);
      return;
    }

    if (status.status !== "matched") {
      return;
    }

    const safetyConfirmed =
      matchingSafetyAccepted ||
      sessionStorage.getItem("connect:matching-safety-confirmed") === "1";
    if (!safetyConfirmed) {
      setIsNavigationOpen(false);
      setIsMatchingOpen(true);
      setMatchingMessage("安全上の確認に同意して会話を開始してください");
      return;
    }

    const friend = status.friend;
    if (status.matchId) {
      confirmMatchingSafety.mutate({ consent: true, matchId: status.matchId });
    }
    openDirectFriend(friend.id);
    setMatchingSafetyAccepted(false);
    sessionStorage.removeItem("connect:matching-safety-confirmed");
    setMatchingState("idle");
    setMatchingMessage(`${getDisplayName(friend)}さんとマッチしました`);
    void Promise.all([
      utils.chat.getFriends.invalidate(),
      utils.chat.getConversation.invalidate({ friendId: friend.id }),
      utils.chat.getPendingMatchFeedback.invalidate(),
    ]);
    cancelMatching.mutate();
  }, [
    cancelMatching,
    confirmMatchingSafety,
    matchingSafetyAccepted,
    matchingState,
    matchingStatus.data,
    openDirectFriend,
    utils.chat.getConversation,
    utils.chat.getFriends,
    utils.chat.getPendingMatchFeedback,
  ]);

  const sendMessage = api.chat.sendMessage.useMutation();
  const toggleDirectReaction = api.chat.toggleReaction.useMutation({
    onSuccess: async () => {
      if (selectedFriendId) {
        await utils.chat.getConversation.invalidate({
          friendId: selectedFriendId,
        });
      }
    },
  });
  const toggleServerReaction = api.server.toggleMessageReaction.useMutation({
    onSuccess: async () => {
      await utils.server.getConversation.invalidate();
    },
  });
  const toggleSavedMessage = api.chat.toggleSavedMessage.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.chat.getConversation.invalidate(),
        utils.server.getConversation.invalidate(),
        utils.chat.getSavedMessages.invalidate(),
      ]);
    },
  });
  const sendServerMessage = api.server.sendMessage.useMutation();

  const createChannel = api.server.createChannel.useMutation({
    onSuccess: async (channel) => {
      setNewChannelName("");
      setIsNewChannelFormOpen(false);
      setServerMessage(null);
      setSelectedServerChannelId(channel.id);
      await utils.server.getOverview.invalidate();
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

  const updateChannel = api.server.updateChannel.useMutation({
    onSuccess: async (channel) => {
      setEditingChannelId(null);
      setEditingChannelName("");
      setChannelContextMenu(null);
      setServerMessage(null);
      setSelectedServerChannelId(channel.id);
      await utils.server.getOverview.invalidate();
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

  const deleteChannel = api.server.deleteChannel.useMutation({
    onSuccess: async (_channel, variables) => {
      const nextChannel = selectedServer?.server.channels.find(
        (channel) => channel.id !== variables.channelId,
      );

      setEditingChannelId(null);
      setEditingChannelName("");
      setChannelContextMenu(null);
      setServerMessage(null);
      setSelectedServerChannelId(nextChannel?.id ?? null);
      await Promise.all([
        utils.server.getOverview.invalidate(),
        nextChannel
          ? utils.server.getConversation.invalidate({
              channelId: nextChannel.id,
              serverId: variables.serverId,
            })
          : Promise.resolve(),
      ]);
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

  const updateDirectMessage = api.chat.updateMessage.useMutation({
    onSuccess: async () => {
      setEditingMessage(null);
      setMessageContextMenu(null);
      setMessage(null);
      await Promise.all([
        selectedFriendId
          ? utils.chat.getConversation.invalidate({
              friendId: selectedFriendId,
            })
          : Promise.resolve(),
        utils.chat.getFriends.invalidate(),
      ]);
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const deleteDirectMessage = api.chat.deleteMessage.useMutation({
    onSuccess: async () => {
      setMessageContextMenu(null);
      await Promise.all([
        selectedFriendId
          ? utils.chat.getConversation.invalidate({
              friendId: selectedFriendId,
            })
          : Promise.resolve(),
        utils.chat.getFriends.invalidate(),
      ]);
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const updateServerMessage = api.server.updateMessage.useMutation({
    onSuccess: async () => {
      setEditingMessage(null);
      setMessageContextMenu(null);
      setServerMessage(null);
      await utils.server.getConversation.invalidate({
        channelId: selectedServerChannel?.id,
        serverId: selectedServerId ?? "",
      });
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

  const toggleServerMessagePin = api.server.toggleMessagePin.useMutation({
    onSuccess: async () => {
      setMessageContextMenu(null);
      setServerMessage(null);
      await utils.server.getConversation.invalidate({
        channelId: selectedServerChannel?.id,
        serverId: selectedServerId ?? "",
      });
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

  const deleteServerMessage = api.server.deleteMessage.useMutation({
    onSuccess: async () => {
      setMessageContextMenu(null);
      await Promise.all([
        utils.server.getConversation.invalidate({
          channelId: selectedServerChannel?.id,
          serverId: selectedServerId ?? "",
        }),
        utils.server.getOverview.invalidate(),
      ]);
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

  const leaveServer = api.server.leave.useMutation({
    onSuccess: async () => {
      setIsNavigationOpen(true);
      setSelectedServerId(null);
      setSelectedServerChannelId(null);
      setIsFriendsOpen(false);
      setIsMatchingOpen(false);
      setIsServerSettingsOpen(false);
      setServerMessage(null);
      setSelectedFriendId(friends.data?.[0]?.friend.id ?? null);
      await utils.server.getOverview.invalidate();
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

  const deleteServer = api.server.deleteServer.useMutation({
    onSuccess: async () => {
      setIsNavigationOpen(true);
      setSelectedServerId(null);
      setSelectedServerChannelId(null);
      setIsFriendsOpen(false);
      setIsMatchingOpen(false);
      setIsServerSettingsOpen(false);
      setServerMessage(null);
      setSelectedFriendId(friends.data?.[0]?.friend.id ?? null);
      await utils.server.getOverview.invalidate();
    },
    onError: (error) => setServerSettingsMessage(getErrorMessage(error)),
  });

  const updateServerMemberRole = api.server.updateMemberRole.useMutation({
    onSuccess: async () => {
      setServerMessage(null);
      await Promise.all([
        utils.server.getMembers.invalidate(),
        utils.server.getOverview.invalidate(),
      ]);
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

  const removeServerMember = api.server.removeMember.useMutation({
    onSuccess: async () => {
      setServerMessage(null);
      await Promise.all([
        utils.server.getMembers.invalidate(),
        utils.server.getOverview.invalidate(),
      ]);
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

  const updateServer = api.server.update.useMutation({
    onSuccess: async () => {
      setServerIconFile(null);
      setServerSettingsMessage("サーバー設定を保存しました");
      await utils.server.getOverview.invalidate();
    },
    onError: (error) => setServerSettingsMessage(getErrorMessage(error)),
  });
  const updateServerDiscovery = api.server.updateDiscovery.useMutation({
    onError: (error) => setServerSettingsMessage(getErrorMessage(error)),
  });

  const rotateServerInvite = api.server.rotateInvite.useMutation({
    onSuccess: async () => {
      setServerSettingsMessage("招待リンクを再発行しました");
      await utils.server.getOverview.invalidate();
    },
    onError: (error) => setServerSettingsMessage(getErrorMessage(error)),
  });

  const selectHome = () => {
    setIsNavigationOpen(true);
    setSelectedServerId(null);
    setSelectedServerChannelId(null);
    setIsFriendsOpen(false);
    setIsMatchingOpen(false);
    setEditingChannelId(null);
    setEditingChannelName("");
    setNewChannelName("");
    setIsNewChannelFormOpen(false);
    setChannelContextMenu(null);
    setIsServerMenuOpen(false);
    setServerMessage(null);
    setSelectedFriendId(friends.data?.[0]?.friend.id ?? null);
  };

  const selectFriend = (friendId: string) => {
    setIsNavigationOpen(false);
    setSelectedServerId(null);
    setSelectedServerChannelId(null);
    setIsFriendsOpen(false);
    setIsMatchingOpen(false);
    setEditingChannelId(null);
    setEditingChannelName("");
    setNewChannelName("");
    setIsNewChannelFormOpen(false);
    setChannelContextMenu(null);
    setIsServerMenuOpen(false);
    setSelectedFriendId(friendId);
    setServerMessage(null);
  };

  const selectServer = (membership: ChatServerMembership) => {
    setIsNavigationOpen(true);
    setSelectedServerId(membership.server.id);
    setSelectedServerChannelId(membership.server.channels[0]?.id ?? null);
    setIsFriendsOpen(false);
    setIsMatchingOpen(false);
    setSelectedFriendId(null);
    setEditingChannelId(null);
    setEditingChannelName("");
    setNewChannelName("");
    setIsNewChannelFormOpen(false);
    setChannelContextMenu(null);
    setIsServerMenuOpen(false);
    setServerMessage(null);
    setMessage(null);
  };

  const openChannelMenu = (
    event: MouseEvent<HTMLElement>,
    channel: ChatServerMembership["server"]["channels"][number],
  ) => {
    if (!canManageSelectedChannels) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedServerChannelId(channel.id);
    setMessageContextMenu(null);
    setProfileContextMenu(null);
    setChannelContextMenu({
      channelId: channel.id,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 192)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 104)),
    });
  };

  const openChannelEditor = (
    channel: ChatServerMembership["server"]["channels"][number],
  ) => {
    setChannelContextMenu(null);
    setEditingChannelId(channel.id);
    setEditingChannelName(channel.name);
  };

  const handleStartMatching = () => {
    if (!matchingSafetyAccepted) {
      setMatchingMessage("安全上の確認に同意してから開始してください");
      return;
    }
    sessionStorage.setItem("connect:matching-safety-confirmed", "1");
    setMatchingMessage(null);
    matchRandom.mutate({ topic: matchingTopic });
  };

  const openMatching = () => {
    setIsNavigationOpen(false);
    setSelectedServerId(null);
    setSelectedServerChannelId(null);
    setIsFriendsOpen(false);
    setSelectedFriendId(null);
    setIsMatchingOpen(true);
    setEditingChannelId(null);
    setEditingChannelName("");
    setNewChannelName("");
    setIsNewChannelFormOpen(false);
    setChannelContextMenu(null);
    setIsServerMenuOpen(false);
    setServerMessage(null);
    setMessage(null);
  };

  const openFriends = () => {
    setIsNavigationOpen(false);
    setSelectedServerId(null);
    setSelectedServerChannelId(null);
    setSelectedFriendId(null);
    setIsFriendsOpen(true);
    setIsMatchingOpen(false);
    setEditingChannelId(null);
    setEditingChannelName("");
    setNewChannelName("");
    setIsNewChannelFormOpen(false);
    setChannelContextMenu(null);
    setIsServerMenuOpen(false);
    setServerMessage(null);
    setMessage(null);
  };

  const openDirectMessages = () => {
    setIsNavigationOpen(false);
    setSelectedServerId(null);
    setSelectedServerChannelId(null);
    setIsFriendsOpen(false);
    setIsMatchingOpen(false);
    setEditingChannelId(null);
    setEditingChannelName("");
    setNewChannelName("");
    setIsNewChannelFormOpen(false);
    setChannelContextMenu(null);
    setIsServerMenuOpen(false);
    setServerMessage(null);
    setMessage(null);
    setSelectedFriendId(friends.data?.[0]?.friend.id ?? null);
  };

  const handleCancelMatching = () => {
    setMatchingState("idle");
    setMatchingMessage(null);
    setMatchingSafetyAccepted(false);
    sessionStorage.removeItem("connect:matching-safety-confirmed");
    cancelMatching.mutate();
  };

  const openServerSettings = () => {
    if (!selectedServer || !canManageSelectedServer) return;

    setServerNameDraft(selectedServer.server.name);
    setServerVisibilityDraft(selectedServer.server.visibility);
    setServerCategoryDraft(selectedServer.server.category ?? "");
    setServerTagsDraft(selectedServer.server.tags.join(", "));
    setServerIconFile(null);
    setServerSettingsMessage(null);
    setIsServerMenuOpen(false);
    setIsServerSettingsOpen(true);
  };

  const openServerReports = () => {
    if (!selectedServer || !canManageSelectedReports) return;

    setModerationNotice(null);
    setIsServerSettingsOpen(false);
    setIsServerReportsOpen(true);
  };

  const handleCopyServerInvite = async () => {
    const inviteCode = selectedServer?.server.inviteCode;
    if (!inviteCode) return;

    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/servers/invite/${inviteCode}`,
      );
      setServerSettingsMessage("招待リンクをコピーしました");
    } catch {
      setServerSettingsMessage("招待リンクをコピーできませんでした");
    }
  };

  const handleServerSettingsSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (
      !selectedServer?.server.id ||
      !canManageSelectedServer ||
      !serverNameDraft.trim()
    ) {
      return;
    }

    try {
      if (serverIconFile) {
        const formData = new FormData();
        formData.append("icon", serverIconFile);
        const response = await fetch(
          `/api/servers/${selectedServer.server.id}/icon`,
          {
            method: "POST",
            body: formData,
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(data?.message ?? "アイコンの保存に失敗しました");
        }
      }

      const tags = [
        ...new Set(
          serverTagsDraft
            .toLowerCase()
            .split(/[\s,]+/u)
            .filter(Boolean),
        ),
      ].slice(0, 5);
      await updateServerDiscovery.mutateAsync({
        category: serverCategoryDraft || null,
        serverId: selectedServer.server.id,
        tags,
        visibility: serverVisibilityDraft,
      });
      await updateServer.mutateAsync({
        description: selectedServer.server.description ?? undefined,
        name: serverNameDraft,
        serverId: selectedServer.server.id,
      });
    } catch (error) {
      setServerSettingsMessage(getErrorMessage(error));
    }
  };

  const handleDeleteServer = () => {
    if (!selectedServer?.server.id) return;
    if (!window.confirm("このサーバーを削除しますか？")) return;

    deleteServer.mutate({ serverId: selectedServer.server.id });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !selectedFriendId ||
      !canSendDirectMessage ||
      (!draft.trim() && directAttachments.length === 0)
    )
      return;
    const clientId = crypto.randomUUID();
    const content = draft.trim() || "添付ファイル";
    const friendId = selectedFriendId;
    const activeAttachments = directAttachments;

    broadcastTyping(false);
    setDraft("");
    setDirectAttachments([]);
    localStorage.removeItem(`connect:draft:direct:${friendId}`);
    setMessage(null);
    setPendingDirectMessages((messages) => [
      ...messages,
      {
        clientId,
        content,
        createdAt: new Date(),
        friendId,
        status: "pending",
      },
    ]);
    requestAnimationFrame(messageViewport.scrollToBottom);
    lastTypingSentAtRef.current = 0;
    if (localTypingStopTimerRef.current) {
      clearTimeout(localTypingStopTimerRef.current);
    }

    const activeReply = replyTarget?.kind === "direct" ? replyTarget : null;
    setReplyTarget(null);
    sendMessage.mutate(
      {
        attachmentIds: activeAttachments.map(({ id }) => id),
        clientId,
        content,
        friendId,
        replyToId: activeReply?.id,
      },
      {
        onError: (error) => {
          setPendingDirectMessages((messages) =>
            messages.filter(
              (pendingMessage) => pendingMessage.clientId !== clientId,
            ),
          );
          setDraft((current) => current || content);
          setDirectAttachments(activeAttachments);
          localStorage.setItem(`connect:draft:direct:${friendId}`, content);
          setMessage(getErrorMessage(error));
          setReplyTarget(activeReply);
        },
        onSuccess: (savedMessage) => {
          setPendingDirectMessages((messages) =>
            messages.map((pendingMessage) =>
              pendingMessage.clientId === clientId
                ? {
                    ...pendingMessage,
                    messageId: savedMessage.id,
                    status: "confirmed",
                  }
                : pendingMessage,
            ),
          );
          void Promise.all([
            utils.chat.getConversation.invalidate({ friendId }),
            utils.chat.getFriends.invalidate(),
          ]);
        },
      },
    );
  };

  const handleServerSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !selectedServerId ||
      !selectedServerChannel?.id ||
      !canSendSelectedServerMessages ||
      (!serverDraft.trim() && serverAttachments.length === 0)
    ) {
      return;
    }
    const channelId = selectedServerChannel.id;
    const clientId = crypto.randomUUID();
    const content = serverDraft.trim() || "添付ファイル";
    const serverId = selectedServerId;
    const activeAttachments = serverAttachments;

    setServerDraft("");
    setServerAttachments([]);
    localStorage.removeItem(`connect:draft:server:${channelId}`);
    setServerMessage(null);
    setPendingServerMessages((messages) => [
      ...messages,
      {
        channelId,
        clientId,
        content,
        createdAt: new Date(),
        serverId,
        status: "pending",
      },
    ]);
    requestAnimationFrame(messageViewport.scrollToBottom);
    const activeReply = replyTarget?.kind === "server" ? replyTarget : null;
    setReplyTarget(null);
    sendServerMessage.mutate(
      {
        attachmentIds: activeAttachments.map(({ id }) => id),
        channelId,
        clientId,
        content,
        replyToId: activeReply?.id,
        serverId,
      },
      {
        onError: (error) => {
          setPendingServerMessages((messages) =>
            messages.filter(
              (pendingMessage) => pendingMessage.clientId !== clientId,
            ),
          );
          setServerDraft((current) => current || content);
          setServerAttachments(activeAttachments);
          localStorage.setItem(`connect:draft:server:${channelId}`, content);
          setServerMessage(getErrorMessage(error));
          setReplyTarget(activeReply);
        },
        onSuccess: (savedMessage) => {
          setPendingServerMessages((messages) =>
            messages.map((pendingMessage) =>
              pendingMessage.clientId === clientId
                ? {
                    ...pendingMessage,
                    messageId: savedMessage.id,
                    status: "confirmed",
                  }
                : pendingMessage,
            ),
          );
          void utils.server.getConversation.invalidate({ channelId, serverId });
        },
      },
    );
  };

  const handleCreateChannel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !selectedServer?.server.id ||
      !canManageSelectedChannels ||
      !newChannelName.trim()
    ) {
      return;
    }

    createChannel.mutate({
      name: newChannelName,
      serverId: selectedServer.server.id,
    });
  };

  const handleUpdateChannel = (
    event: FormEvent<HTMLFormElement>,
    channelId: string,
  ) => {
    event.preventDefault();
    if (
      !selectedServer?.server.id ||
      !canManageSelectedChannels ||
      !editingChannelName.trim()
    ) {
      return;
    }

    updateChannel.mutate({
      channelId,
      name: editingChannelName,
      serverId: selectedServer.server.id,
    });
  };

  const handleDeleteChannel = (channelId: string) => {
    if (!selectedServer?.server.id || !canManageSelectedChannels) return;
    if (
      !window.confirm(
        "このチャンネルを削除しますか？チャンネル内のメッセージもすべて削除されます。",
      )
    ) {
      return;
    }

    setChannelContextMenu(null);
    deleteChannel.mutate({
      channelId,
      serverId: selectedServer.server.id,
    });
  };

  const handleUpdateServerMemberRole = (
    memberId: string,
    role: ServerMemberRole,
  ) => {
    if (!selectedServer?.server.id) return;
    if (
      role === "OWNER" &&
      !window.confirm(
        "このメンバーへサーバー所有権を移譲しますか？移譲後はあなたがメンバーになります。",
      )
    ) {
      return;
    }

    updateServerMemberRole.mutate({
      memberId,
      role,
      serverId: selectedServer.server.id,
    });
  };

  const handleRemoveServerMember = (memberId: string, name: string) => {
    if (!selectedServer?.server.id) return;
    if (!window.confirm(`${name}をこのサーバーから退出させますか？`)) return;

    removeServerMember.mutate({
      memberId,
      serverId: selectedServer.server.id,
    });
  };

  const openProfileContextMenu = (
    event: MouseEvent<HTMLElement>,
    user: ProfileContextUser,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setChannelContextMenu(null);
    setMessageContextMenu(null);
    setProfileContextMenu(null);

    const currentUserId =
      currentServerUser?.userId ??
      directConversation?.currentUser.userId ??
      serverConversationData?.currentUser.userId;
    if (user.userId === currentUserId) return;

    setProfileContextMenu({
      name: user.name,
      userId: user.userId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 192)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 56)),
    });
  };

  const handleBlockUser = () => {
    if (!profileContextMenu) return;
    if (
      !window.confirm(
        `${getDisplayName(profileContextMenu)}をブロックしますか？`,
      )
    ) {
      return;
    }

    blockUser.mutate({ userId: profileContextMenu.userId });
  };

  const openDirectMessageMenu = (
    event: MouseEvent<HTMLElement>,
    chatMessage: { id: string; senderId: string },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setChannelContextMenu(null);
    setProfileContextMenu(null);
    setMessageContextMenu({
      kind: "direct",
      messageId: chatMessage.id,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 192)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 136)),
    });
  };

  const openServerMessageMenu = (
    event: MouseEvent<HTMLElement>,
    chatMessage: { id: string; senderId: string },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setChannelContextMenu(null);
    setProfileContextMenu(null);
    setMessageContextMenu({
      kind: "server",
      messageId: chatMessage.id,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 192)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 144)),
    });
  };

  const startEditingMessage = (
    kind: EditingMessage["kind"],
    chatMessage: { content: string; id: string },
  ) => {
    setMessageContextMenu(null);
    setEditingMessage({
      content: chatMessage.content,
      kind,
      messageId: chatMessage.id,
    });
  };

  const startReply = () => {
    if (!messageContextMenu || !messageContextTarget) return;
    if (
      messageContextMenu.kind === "server" &&
      !canSendSelectedServerMessages
    ) {
      return;
    }
    setReplyTarget({
      content: messageContextTarget.content,
      id: messageContextTarget.id,
      kind: messageContextMenu.kind,
    });
    setMessageContextMenu(null);
  };

  const quoteContextMessage = () => {
    if (!messageContextMenu || !messageContextTarget) return;
    if (
      messageContextMenu.kind === "server" &&
      !canSendSelectedServerMessages
    ) {
      return;
    }
    const quoted = messageContextTarget.content
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    if (messageContextMenu.kind === "server") {
      handleServerDraftChange(
        `${serverDraft.trimEnd()}${serverDraft ? "\n" : ""}${quoted}\n`.slice(
          0,
          1000,
        ),
      );
    } else {
      handleDraftChange(
        `${draft.trimEnd()}${draft ? "\n" : ""}${quoted}\n`.slice(0, 1000),
      );
    }
    setMessageContextMenu(null);
  };

  const toggleContextSaved = () => {
    if (!messageContextMenu || !messageContextTarget) return;
    toggleSavedMessage.mutate({
      kind: messageContextMenu.kind === "direct" ? "DIRECT" : "SERVER",
      messageId: messageContextTarget.id,
    });
    setMessageContextMenu(null);
  };

  const reactToContextMessage = (
    emoji:
      | "\u{1F44D}"
      | "\u{2764}\u{FE0F}"
      | "\u{1F602}"
      | "\u{1F389}"
      | "\u{1F62E}"
      | "\u{1F64F}",
  ) => {
    if (!messageContextMenu || !messageContextTarget) return;
    if (messageContextMenu.kind === "direct") {
      toggleDirectReaction.mutate({
        emoji,
        messageId: messageContextTarget.id,
      });
    } else if (selectedServerId && canReactToSelectedServerMessages) {
      toggleServerReaction.mutate({
        emoji,
        messageId: messageContextTarget.id,
        serverId: selectedServerId,
      });
    }
    setMessageContextMenu(null);
  };

  const handleMessageEditSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingMessage?.content.trim()) return;

    if (editingMessage.kind === "direct") {
      updateDirectMessage.mutate({
        content: editingMessage.content,
        messageId: editingMessage.messageId,
      });
      return;
    }

    if (!selectedServer?.server.id || !canSendSelectedServerMessages) return;
    updateServerMessage.mutate({
      content: editingMessage.content,
      messageId: editingMessage.messageId,
      serverId: selectedServer.server.id,
    });
  };

  const handleToggleServerMessagePin = (messageId: string) => {
    if (!selectedServer?.server.id || !canManageSelectedReports) return;

    toggleServerMessagePin.mutate({
      messageId,
      serverId: selectedServer.server.id,
    });
  };

  const handleDeleteDirectMessage = (messageId: string) => {
    setMessageContextMenu(null);
    if (!window.confirm("このメッセージを削除しますか？")) return;
    deleteDirectMessage.mutate({ messageId });
  };

  const handleDeleteServerMessage = (messageId: string) => {
    if (
      !selectedServer?.server.id ||
      (!canManageSelectedReports && !canSendSelectedServerMessages)
    ) {
      return;
    }
    setMessageContextMenu(null);
    if (!window.confirm("このメッセージを削除しますか？")) return;

    deleteServerMessage.mutate({
      messageId,
      serverId: selectedServer.server.id,
    });
  };

  const handleLeaveServer = () => {
    if (!selectedServer?.server.id) return;
    if (!window.confirm("このサーバーから退出しますか？")) return;

    leaveServer.mutate({ serverId: selectedServer.server.id });
  };

  const serverMessageContextTarget =
    messageContextMenu?.kind === "server"
      ? serverMessages.find(
          (chatMessage) => chatMessage.id === messageContextMenu.messageId,
        )
      : null;
  const directMessageContextTarget =
    messageContextMenu?.kind === "direct"
      ? directMessages.find(
          (chatMessage) => chatMessage.id === messageContextMenu.messageId,
        )
      : null;
  const messageContextTarget =
    serverMessageContextTarget ?? directMessageContextTarget;
  const isDirectContextMessageMine =
    directMessageContextTarget?.senderId === directConversation?.currentUserId;
  const isServerContextMessageMine =
    serverMessageContextTarget?.senderId ===
    serverConversationData?.currentUser.id;
  const canEditContextMessage = Boolean(
    isDirectContextMessageMine ||
    (isServerContextMessageMine && canSendSelectedServerMessages),
  );
  const canDeleteContextMessage = Boolean(
    isDirectContextMessageMine ||
    (serverMessageContextTarget &&
      (canManageSelectedReports ||
        (isServerContextMessageMine && canSendSelectedServerMessages))),
  );
  const canReportContextMessage = [
    Boolean(directMessageContextTarget && !isDirectContextMessageMine),
    Boolean(serverMessageContextTarget && !isServerContextMessageMine),
  ].some(Boolean);
  const openMessageReport = () => {
    if (
      !messageContextMenu ||
      !messageContextTarget ||
      !canReportContextMessage
    ) {
      return;
    }

    setReportTarget({
      content: messageContextTarget.content,
      messageId: messageContextTarget.id,
      messageKind: messageContextMenu.kind === "direct" ? "DIRECT" : "SERVER",
    });
    setReportReason("HARASSMENT");
    setReportDetails("");
    setModerationNotice(null);
    setMessageContextMenu(null);
  };
  const handleMessageReportSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reportTarget) return;
    const details = reportDetails.trim();

    submitMessageReport.mutate({
      details: details.length > 0 ? details : undefined,
      messageId: reportTarget.messageId,
      messageKind: reportTarget.messageKind,
      reason: reportReason,
    });
  };
  const handleCopyMessage = async () => {
    if (!messageContextTarget) return;

    try {
      await navigator.clipboard.writeText(messageContextTarget.content);
      setMessageContextMenu(null);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      if (messageContextMenu?.kind === "server") {
        setServerMessage(errorMessage);
      } else {
        setMessage(errorMessage);
      }
    }
  };

  return (
    <main className="bg-connect-paper text-connect-ink flex h-dvh min-h-dvh overflow-hidden">
      <ServerRail
        memberships={serverOverview.data?.memberships}
        onSelectHome={selectHome}
        onSelectServer={selectServer}
        onSearch={() => setIsGlobalSearchOpen(true)}
        selectedServerId={selectedServerId}
      />
      <GlobalSearchDialog
        open={isGlobalSearchOpen}
        onOpenChange={setIsGlobalSearchOpen}
        onOpenDirect={selectFriend}
        onOpenGroup={(groupId) => {
          setSelectedGroupId(groupId);
          setIsGroupDmOpen(true);
        }}
        onOpenServer={(serverId, channelId) => {
          const membership = serverOverview.data?.memberships.find(
            (item) => item.server.id === serverId,
          );
          if (membership) selectServer(membership);
          else {
            setSelectedServerId(serverId);
            setSelectedFriendId(null);
            setIsNavigationOpen(false);
          }
          if (channelId) setSelectedServerChannelId(channelId);
        }}
      />
      <aside
        className={`${
          isNavigationOpen ? "flex" : "hidden"
        } border-connect-ink/15 bg-connect-navigation w-[calc(100vw-4rem)] shrink-0 flex-col border-r md:flex md:w-[300px] md:max-w-[300px]`}
        aria-label={
          selectedServer ? "スペース内ナビゲーション" : "会話ナビゲーション"
        }
      >
        {selectedServer ? (
          <>
            <div className="border-connect-ink/15 relative border-b px-3 py-3 shadow-sm">
              <button
                type="button"
                onClick={() => setIsServerMenuOpen((isOpen) => !isOpen)}
                className="hover:bg-connect-surface flex min-h-12 w-full items-center justify-between gap-3 rounded-md px-2 text-left transition"
                aria-expanded={isServerMenuOpen}
              >
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold">
                    {selectedServer.server.name}
                  </span>
                  <span className="text-connect-muted mt-1 block text-xs">
                    {serverMembers.data?.length ?? 0} メンバー
                  </span>
                </span>
                <ChevronDown
                  className={`text-connect-muted h-4 w-4 shrink-0 transition ${
                    isServerMenuOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
              {isServerMenuOpen && (
                <div className="border-connect-ink/15 bg-connect-surface absolute top-[calc(100%-0.5rem)] right-3 left-3 z-40 rounded-md border p-1 text-sm shadow-xl">
                  {canManageSelectedServer && (
                    <button
                      type="button"
                      onClick={openServerSettings}
                      className="hover:bg-connect-highlight flex min-h-10 w-full items-center gap-2 rounded px-3 text-left font-medium transition"
                    >
                      <Settings className="h-4 w-4" aria-hidden="true" />
                      サーバー設定
                    </button>
                  )}
                  {canManageSelectedReports && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsServerMenuOpen(false);
                        openServerReports();
                      }}
                      className="hover:bg-connect-highlight flex min-h-10 w-full items-center gap-2 rounded px-3 text-left font-medium transition"
                    >
                      <Flag className="h-4 w-4" aria-hidden="true" />
                      通報一覧
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsServerMenuOpen(false);
                      handleLeaveServer();
                    }}
                    disabled={isSelectedServerOwner || leaveServer.isPending}
                    className="text-connect-danger hover:bg-connect-danger-soft flex min-h-10 w-full items-center gap-2 rounded px-3 text-left font-medium transition disabled:opacity-50"
                    title={
                      isSelectedServerOwner
                        ? "所有権を移譲してから退出してください"
                        : "退出"
                    }
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    {isSelectedServerOwner ? "所有権を移譲して退出" : "退出"}
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <p className="text-connect-muted text-xs font-semibold tracking-wide uppercase">
                  テキストチャンネル
                </p>
                {canManageSelectedChannels && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewChannelFormOpen((isOpen) => !isOpen);
                      setEditingChannelId(null);
                      setEditingChannelName("");
                      setChannelContextMenu(null);
                    }}
                    className="text-connect-muted hover:bg-connect-surface hover:text-connect-ink flex h-7 w-7 items-center justify-center rounded-md transition"
                    aria-label="チャンネル追加フォームを開く"
                    title="チャンネルを追加"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              {canManageSelectedChannels && isNewChannelFormOpen && (
                <form
                  onSubmit={handleCreateChannel}
                  className="mb-3 flex gap-2"
                >
                  <input
                    value={newChannelName}
                    onChange={(event) => setNewChannelName(event.target.value)}
                    className="border-connect-ink/15 bg-connect-surface text-connect-ink placeholder:text-connect-placeholder min-h-9 min-w-0 flex-1 rounded-md border px-2 text-sm"
                    placeholder="new-channel"
                    maxLength={32}
                    aria-label="チャンネル名"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!newChannelName.trim() || createChannel.isPending}
                    className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="チャンネルを追加"
                    title="チャンネルを追加"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewChannelFormOpen(false);
                      setNewChannelName("");
                    }}
                    className="text-connect-muted hover:bg-connect-surface hover:text-connect-ink flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition"
                    aria-label="キャンセル"
                    title="キャンセル"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </form>
              )}

              <div className="space-y-1">
                {selectedServer.server.channels.map((channel) => {
                  const isSelected = channel.id === selectedServerChannel?.id;
                  const isEditing = editingChannelId === channel.id;

                  if (isEditing) {
                    return (
                      <form
                        key={channel.id}
                        onSubmit={(event) =>
                          handleUpdateChannel(event, channel.id)
                        }
                        className="bg-connect-surface flex min-h-10 items-center gap-1 rounded-md px-2"
                      >
                        <Hash
                          className="text-connect-muted h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                        <input
                          value={editingChannelName}
                          onChange={(event) =>
                            setEditingChannelName(event.target.value)
                          }
                          className="text-connect-ink min-w-0 flex-1 bg-transparent text-sm font-medium focus:outline-none"
                          maxLength={32}
                          autoFocus
                          aria-label="チャンネル名を編集"
                        />
                        <button
                          type="submit"
                          disabled={
                            !editingChannelName.trim() ||
                            updateChannel.isPending
                          }
                          className="bg-connect-action text-connect-surface hover:bg-connect-action-hover flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-45"
                          aria-label="保存"
                          title="保存"
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingChannelId(null);
                            setEditingChannelName("");
                            setChannelContextMenu(null);
                          }}
                          className="text-connect-muted hover:bg-connect-navigation flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition"
                          aria-label="キャンセル"
                          title="キャンセル"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={channel.id}
                      onContextMenu={(event) => openChannelMenu(event, channel)}
                      className={`group flex min-h-10 items-center gap-1 rounded-md px-2 transition ${
                        isSelected
                          ? "bg-connect-ink text-connect-paper"
                          : "text-connect-muted hover:bg-connect-surface hover:text-connect-ink"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setIsNavigationOpen(false);
                          setSelectedServerChannelId(channel.id);
                          setIsServerMenuOpen(false);
                          setServerMessage(null);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <Hash className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span className="truncate text-sm font-medium">
                          {channel.name}
                        </span>
                        {channel.unreadCount > 0 && (
                          <span className="bg-connect-danger text-connect-surface ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold">
                            {channel.unreadCount}
                          </span>
                        )}
                      </button>
                      {canManageSelectedChannels && (
                        <button
                          type="button"
                          onClick={(event) => openChannelMenu(event, channel)}
                          className="hover:bg-connect-ink/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none"
                          aria-label={`${channel.name}の操作`}
                          aria-haspopup="menu"
                          aria-expanded={
                            channelContextMenu?.channelId === channel.id
                          }
                          title="チャンネル操作"
                        >
                          <Ellipsis className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-connect-ink/15 mt-auto border-t px-4 py-3">
              {currentServerUser && (
                <PresenceStatusMenu
                  currentStatus={currentServerUser.presenceStatus}
                >
                  <button
                    type="button"
                    className="hover:bg-connect-surface focus-visible:ring-connect-action flex min-h-12 w-full items-center gap-3 rounded-md px-1 py-1 text-left transition focus-visible:ring-2 focus-visible:outline-none"
                    aria-label={`オンライン状態を変更。現在は${getPresenceDisplayLabel(
                      currentServerUser.presenceStatus,
                    )}`}
                  >
                    <span className="relative shrink-0">
                      <Avatar
                        user={currentServerUser}
                        className="border-connect-ink/10 h-10 w-10 rounded-full border"
                      />
                      <span
                        className={`border-connect-navigation absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 ${getPresenceDotClassName(
                          currentServerUser.presenceStatus,
                        )}`}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {selectedServer.nickname?.trim() ??
                          getDisplayName(currentServerUser)}
                      </span>
                      <span className="text-connect-muted block truncate text-xs">
                        {getPresenceDisplayLabel(
                          currentServerUser.presenceStatus,
                        )}
                      </span>
                    </span>
                  </button>
                </PresenceStatusMenu>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="border-connect-ink/15 border-b px-3 py-3 shadow-sm">
              <label className="border-connect-ink/10 bg-connect-surface text-connect-neutral flex h-11 items-center gap-2 rounded-md border px-3 text-sm">
                <Search className="h-4 w-4" aria-hidden="true" />
                <input
                  value={friendSearch}
                  onChange={(event) => setFriendSearch(event.target.value)}
                  className="text-connect-ink placeholder:text-connect-placeholder min-w-0 flex-1 bg-transparent focus:outline-none"
                  placeholder="フレンドを検索"
                  aria-label="フレンドを検索"
                />
              </label>
            </div>

            <div className="space-y-1 px-2 py-3">
              <button
                type="button"
                onClick={openFriends}
                className={`flex h-11 w-full items-center gap-3 rounded-md px-2 text-left transition ${
                  isFriendsOpen
                    ? "bg-connect-ink text-connect-paper"
                    : "text-connect-muted hover:bg-connect-surface hover:text-connect-ink"
                }`}
              >
                <Users className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-medium">フレンド</span>
              </button>
              <button
                type="button"
                onClick={openDirectMessages}
                className={`flex h-11 w-full items-center gap-3 rounded-md px-2 text-left transition ${
                  !isFriendsOpen && !isMatchingOpen
                    ? "bg-connect-ink text-connect-paper"
                    : "text-connect-muted hover:bg-connect-surface hover:text-connect-ink"
                }`}
              >
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-medium">
                  ダイレクトメッセージ
                </span>
              </button>
              <button
                type="button"
                onClick={openMatching}
                className={`flex h-11 w-full items-center gap-3 rounded-md px-2 text-left transition ${
                  isMatchingOpen
                    ? "bg-connect-ink text-connect-paper"
                    : "text-connect-muted hover:bg-connect-surface hover:text-connect-ink"
                }`}
              >
                <Shuffle className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-medium">マッチング</span>
              </button>
            </div>

            <div className="text-connect-muted flex items-center justify-between px-4 pt-3 pb-2 text-xs font-semibold tracking-wide uppercase">
              <span>DM</span>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={openFriends}
                  className="hover:bg-connect-surface hover:text-connect-ink flex h-11 w-11 items-center justify-center rounded-md transition"
                  aria-label="フレンドを追加・管理"
                  title="フレンドを追加・管理"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
                <GroupDmDialog
                  initialGroupId={selectedGroupId}
                  open={isGroupDmOpen}
                  onOpenChange={setIsGroupDmOpen}
                >
                  <button
                    type="button"
                    className="hover:bg-connect-surface hover:text-connect-ink flex h-11 w-11 items-center justify-center rounded-md transition"
                    aria-label="グループDMを開く"
                    title="グループDMを開く"
                  >
                    <Users className="h-4 w-4" aria-hidden="true" />
                  </button>
                </GroupDmDialog>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
              {groupConversations.isLoading && (
                <div className="bg-connect-surface mx-2 h-14 animate-pulse rounded-md" />
              )}

              {groupConversations.data?.groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    setSelectedGroupId(group.id);
                    setIsGroupDmOpen(true);
                  }}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition ${isGroupDmOpen && selectedGroupId === group.id ? "bg-connect-ink text-connect-paper" : "hover:bg-connect-surface"}`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isGroupDmOpen && selectedGroupId === group.id ? "bg-connect-paper/15" : "bg-connect-highlight text-connect-action"}`}
                  >
                    <Users className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {getGroupDisplayName(group)}
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-xs ${isGroupDmOpen && selectedGroupId === group.id ? "text-connect-focus-soft" : "text-connect-muted"}`}
                    >
                      {getGroupPreview(group)}
                    </span>
                  </span>
                </button>
              ))}

              {friends.isLoading && (
                <div className="space-y-2 px-2">
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="bg-connect-surface h-12 animate-pulse rounded-md"
                    />
                  ))}
                </div>
              )}

              {filteredFriends.map((item) => (
                <FriendListItem
                  key={item.friend.id}
                  item={item}
                  onProfileContextMenu={openProfileContextMenu}
                  onSelect={() => selectFriend(item.friend.id)}
                  selected={item.friend.id === selectedFriendId}
                />
              ))}

              {friends.data?.length === 0 && (
                <div className="border-connect-ink/10 bg-connect-surface text-connect-muted mx-2 rounded-md border p-4 text-sm leading-6">
                  <Inbox className="text-connect-signal mb-3 h-5 w-5" />
                  <p>フレンドを追加すると、ここからDMを始められます。</p>
                  <button
                    type="button"
                    onClick={openFriends}
                    className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-3 font-semibold transition"
                  >
                    <Users className="h-4 w-4" aria-hidden="true" />
                    フレンドを追加
                  </button>
                </div>
              )}

              {friends.data &&
                friends.data.length > 0 &&
                filteredFriends.length === 0 && (
                  <p className="text-connect-muted px-2 py-3 text-sm">
                    該当するフレンドはいません
                  </p>
                )}
            </div>
          </>
        )}
      </aside>

      <section
        className={`${
          isNavigationOpen ? "hidden md:flex" : "flex"
        } bg-connect-surface min-w-0 flex-1 flex-col`}
      >
        <header className="border-connect-ink/15 bg-connect-highlight flex h-14 shrink-0 items-center justify-between border-b px-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsNavigationOpen(true)}
              className="text-connect-muted hover:bg-connect-surface hover:text-connect-ink flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition md:hidden"
              aria-label="ナビゲーションを開く"
              title="ナビゲーションを開く"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            {selectedServer ? (
              <Hash
                className="text-connect-neutral h-5 w-5 shrink-0"
                aria-hidden="true"
              />
            ) : isFriendsOpen ? (
              <Users
                className="text-connect-neutral h-5 w-5 shrink-0"
                aria-hidden="true"
              />
            ) : isMatchingOpen ? (
              <Shuffle
                className="text-connect-neutral h-5 w-5 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <MessageCircle
                className="text-connect-neutral h-5 w-5 shrink-0"
                aria-hidden="true"
              />
            )}
            {selectedServer ? (
              <div className="min-w-0">
                <h1 className="truncate font-semibold">
                  {selectedServerChannel?.name ?? "チャンネル"}
                </h1>
                <p className="text-connect-neutral truncate text-xs">
                  {selectedServer.server.name}
                </p>
              </div>
            ) : selectedFriend ? (
              <>
                <ProfileAvatar
                  user={selectedFriend}
                  className="h-8 w-8"
                  onContextMenu={(event) =>
                    openProfileContextMenu(event, selectedFriend)
                  }
                />
                <div className="min-w-0">
                  <h1 className="truncate font-semibold">
                    {getDisplayName(selectedFriend)}
                  </h1>
                  <p className="text-connect-neutral truncate font-mono text-xs">
                    @{selectedFriend.userId}
                  </p>
                </div>
              </>
            ) : isFriendsOpen ? (
              <h1 className="font-semibold">フレンド</h1>
            ) : isMatchingOpen ? (
              <h1 className="font-semibold">マッチング</h1>
            ) : (
              <h1 className="font-semibold">ダイレクトメッセージ</h1>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {selectedServer && (
              <>
                <button
                  type="button"
                  onClick={() => setIsPinnedMessagesOpen(true)}
                  className="text-connect-muted hover:bg-connect-surface hover:text-connect-ink flex h-11 w-11 items-center justify-center rounded-md transition"
                  aria-label="ピン留めしたメッセージ"
                  title="ピン留めしたメッセージ"
                >
                  <Pin className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMemberListOpen(true)}
                  className="text-connect-muted hover:bg-connect-surface hover:text-connect-ink flex h-11 w-11 items-center justify-center rounded-md transition lg:hidden"
                  aria-label="メンバー一覧"
                  title="メンバー一覧"
                >
                  <Users className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            )}
            <ProfileSettingsDialog>
              <button
                type="button"
                className="text-connect-muted hover:bg-connect-surface hover:text-connect-ink flex h-11 w-11 items-center justify-center rounded-md transition"
                aria-label="設定"
              >
                <Settings className="h-5 w-5" aria-hidden="true" />
              </button>
            </ProfileSettingsDialog>
          </div>
        </header>

        {hasChatQueryError && <ChatQueryError onRetry={retryChatQueries} />}

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={messageViewport.containerRef}
              data-chat-viewport
              onScroll={messageViewport.handleScroll}
              className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5"
            >
              {selectedServer ? (
                <>
                  {serverConversation.isLoading && (
                    <div className="space-y-4">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="flex gap-3">
                          <div className="bg-connect-navigation h-10 w-10 animate-pulse rounded-full" />
                          <div className="space-y-2">
                            <div className="bg-connect-navigation h-4 w-36 animate-pulse rounded" />
                            <div className="bg-connect-navigation h-10 w-80 max-w-[70vw] animate-pulse rounded" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {serverConversationData && !hasServerMessages && (
                    <div className="flex min-h-full items-end pb-8">
                      <div>
                        <div className="bg-connect-ink text-connect-paper mb-4 flex h-20 w-20 items-center justify-center rounded-2xl text-2xl font-semibold">
                          {selectedServer.server.name.slice(0, 2).toUpperCase()}
                        </div>
                        <h2 className="text-3xl font-semibold">
                          {selectedServer.server.name}へようこそ
                        </h2>
                        <p className="text-connect-muted mt-2 max-w-xl leading-7">
                          {canSendSelectedServerMessages
                            ? `#${selectedServerChannel?.name ?? "general"} の最初のメッセージを送って、会話を始めましょう。`
                            : `#${selectedServerChannel?.name ?? "general"} にはまだメッセージがありません。`}
                        </p>
                      </div>
                    </div>
                  )}

                  {serverConversationData && hasServerMessages && (
                    <div>
                      {serverConversation.hasNextPage && (
                        <div className="flex justify-center pb-4">
                          <button
                            type="button"
                            onClick={() =>
                              void serverConversation.fetchNextPage()
                            }
                            disabled={serverConversation.isFetchingNextPage}
                            className="border-connect-ink/15 bg-connect-surface text-connect-muted hover:bg-connect-paper min-h-9 rounded-md border px-3 text-sm font-semibold transition disabled:opacity-50"
                          >
                            {serverConversation.isFetchingNextPage
                              ? "読み込み中..."
                              : "過去のメッセージを読み込む"}
                          </button>
                        </div>
                      )}
                      {serverMessages.map((chatMessage, messageIndex) => {
                        const isMine =
                          chatMessage.senderId ===
                          serverConversationData.currentUser.id;
                        const author = isMine
                          ? {
                              ...serverConversationData.currentUser,
                              name:
                                selectedServer.nickname?.trim() ??
                                serverConversationData.currentUser.name,
                            }
                          : {
                              ...chatMessage.sender,
                              name:
                                chatMessage.sender.serverMemberships[0]
                                  ?.nickname ?? chatMessage.sender.name,
                            };
                        const isEditing =
                          editingMessage?.kind === "server" &&
                          editingMessage.messageId === chatMessage.id;
                        const isFollowup =
                          !chatMessage.pinnedAt &&
                          chatMessage.id !== firstServerUnreadMessageId &&
                          shouldGroupMessage(
                            chatMessage,
                            serverMessages[messageIndex - 1],
                          );

                        return (
                          <article
                            key={chatMessage.id}
                            onContextMenu={(event) =>
                              openServerMessageMenu(event, chatMessage)
                            }
                            className={`group hover:bg-connect-paper relative flex flex-wrap items-start gap-x-3 gap-y-0 rounded-md px-2 ${isFollowup ? "py-0.5" : "py-1.5"}`}
                          >
                            {chatMessage.id === firstServerUnreadMessageId && (
                              <NewMessagesSeparator
                                separatorRef={messageViewport.unreadRef}
                              />
                            )}
                            {isFollowup ? (
                              <time
                                dateTime={chatMessage.createdAt.toISOString()}
                                className="text-connect-neutral mt-1 w-10 shrink-0 text-center text-[10px] opacity-0 transition group-hover:opacity-100"
                                aria-label={`${getDisplayName(author)}、${formatMessageTime(chatMessage.createdAt)}`}
                              >
                                {formatMessageTime(chatMessage.createdAt)}
                              </time>
                            ) : (
                              <ProfileAvatar
                                user={author}
                                serverId={selectedServer.server.id}
                                className="mt-1 h-10 w-10"
                                onContextMenu={(event) =>
                                  openProfileContextMenu(event, author)
                                }
                              />
                            )}
                            <div className="min-w-0 flex-1 text-left">
                              {chatMessage.replyTo && (
                                <div className="border-connect-action/35 text-connect-muted mb-1 block max-w-full truncate border-l-2 pl-2 text-xs">
                                  {getDisplayName(chatMessage.replyTo.sender)}:{" "}
                                  {chatMessage.replyTo.content}
                                </div>
                              )}
                              {!isFollowup && (
                                <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                                  <span className="text-connect-ink text-sm font-semibold">
                                    {getDisplayName(author)}
                                  </span>
                                  <time className="text-connect-neutral text-xs">
                                    {formatMessageTime(chatMessage.createdAt)}
                                  </time>
                                  {chatMessage.pinnedAt && (
                                    <span className="text-connect-action inline-flex items-center gap-1 text-xs font-medium">
                                      <Pin
                                        className="h-3 w-3"
                                        aria-hidden="true"
                                      />
                                      ピン留め
                                    </span>
                                  )}
                                </div>
                              )}
                              {isEditing ? (
                                <form
                                  onSubmit={handleMessageEditSubmit}
                                  className="space-y-2"
                                >
                                  <textarea
                                    value={editingMessage.content}
                                    onChange={(event) =>
                                      setEditingMessage({
                                        ...editingMessage,
                                        content: event.target.value,
                                      })
                                    }
                                    className="border-connect-ink/15 bg-connect-surface text-connect-ink min-h-24 w-full resize-y rounded-md border px-3 py-2 text-left leading-6"
                                    maxLength={1000}
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setEditingMessage(null)}
                                      className="border-connect-ink/15 text-connect-muted hover:bg-connect-paper inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition"
                                    >
                                      キャンセル
                                    </button>
                                    <button
                                      type="submit"
                                      disabled={
                                        !editingMessage.content.trim() ||
                                        updateServerMessage.isPending
                                      }
                                      className="bg-connect-action text-connect-surface hover:bg-connect-action-hover inline-flex min-h-9 items-center rounded-md px-3 text-sm font-semibold transition disabled:opacity-50"
                                    >
                                      保存
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <p className="text-connect-ink text-left leading-7 break-words whitespace-pre-wrap">
                                  <MessageText
                                    content={chatMessage.content}
                                    onOpenLink={setPendingExternalLink}
                                  />
                                </p>
                              )}
                              <MessageAttachmentList
                                attachments={chatMessage.attachments}
                              />
                              {chatMessage.reactions.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {groupReactions(chatMessage.reactions).map(
                                    ([emoji, reactions]) => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() =>
                                          selectedServerId &&
                                          toggleServerReaction.mutate({
                                            emoji: emoji as "\u{1F44D}",
                                            messageId: chatMessage.id,
                                            serverId: selectedServerId,
                                          })
                                        }
                                        disabled={
                                          !canReactToSelectedServerMessages
                                        }
                                        className="border-connect-ink/15 bg-connect-paper min-h-8 rounded-full border px-2 text-xs disabled:cursor-default"
                                        title={
                                          canReactToSelectedServerMessages
                                            ? undefined
                                            : "閲覧のみのためリアクションできません"
                                        }
                                      >
                                        {emoji} {reactions.length}
                                      </button>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(event) =>
                                openServerMessageMenu(event, chatMessage)
                              }
                              className="text-connect-muted hover:bg-connect-highlight focus-visible:ring-connect-action flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none md:absolute md:top-1 md:right-2"
                              aria-label="メッセージ操作"
                              aria-haspopup="menu"
                              aria-expanded={
                                messageContextMenu?.kind === "server" &&
                                messageContextMenu.messageId === chatMessage.id
                              }
                            >
                              <Settings
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </button>
                          </article>
                        );
                      })}
                      {activeServerPendingMessages.map(
                        (pendingMessage, pendingIndex) => (
                          <PendingMessageRow
                            key={pendingMessage.clientId}
                            author={{
                              ...serverConversationData.currentUser,
                              name:
                                selectedServer.nickname?.trim() ??
                                serverConversationData.currentUser.name,
                            }}
                            isFollowup={shouldGroupPendingMessage(
                              pendingMessage,
                              activeServerPendingMessages[pendingIndex - 1],
                              serverMessages.at(-1),
                              serverConversationData.currentUser.id,
                            )}
                            message={pendingMessage}
                            onOpenLink={setPendingExternalLink}
                            serverId={selectedServer.server.id}
                          />
                        ),
                      )}
                      <div ref={messageViewport.endRef} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  {isFriendsOpen && <FriendPanel />}

                  {isMatchingOpen && (
                    <div className="flex h-full items-center justify-center">
                      <div className="max-w-sm text-center">
                        <Shuffle className="text-connect-signal mx-auto mb-4 h-12 w-12" />
                        <h2 className="text-xl font-semibold">マッチング</h2>
                        <p className="text-connect-muted mt-2 text-sm leading-6">
                          話したいことを選んで、同じ話題の相手を探せます。
                        </p>
                      </div>
                    </div>
                  )}

                  {!isMatchingOpen &&
                    !isFriendsOpen &&
                    !selectedFriendId &&
                    !friends.isLoading &&
                    !friends.isError && (
                      <div className="flex h-full items-center justify-center">
                        <div className="max-w-sm text-center">
                          <MessageCircle className="text-connect-signal mx-auto mb-4 h-12 w-12" />
                          <h2 className="text-xl font-semibold">
                            DMを選択してください
                          </h2>
                          <p className="text-connect-muted mt-2 text-sm leading-6">
                            フレンド一覧から相手を選ぶと、会話を始められます。
                          </p>
                          <button
                            type="button"
                            onClick={openFriends}
                            className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 font-semibold transition"
                          >
                            <Users className="h-4 w-4" aria-hidden="true" />
                            フレンドを追加・管理
                          </button>
                        </div>
                      </div>
                    )}

                  {!isFriendsOpen &&
                    conversation.isLoading &&
                    selectedFriendId && (
                      <div className="space-y-4">
                        {[0, 1, 2].map((item) => (
                          <div key={item} className="flex gap-3">
                            <div className="bg-connect-navigation h-10 w-10 animate-pulse rounded-full" />
                            <div className="space-y-2">
                              <div className="bg-connect-navigation h-4 w-36 animate-pulse rounded" />
                              <div className="bg-connect-navigation h-10 w-80 max-w-[70vw] animate-pulse rounded" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  {!isFriendsOpen &&
                    directConversation &&
                    !hasDirectMessages && (
                      <div className="flex min-h-full items-end pb-8">
                        <div>
                          <ProfileAvatar
                            user={directConversation.friend}
                            className="mb-4 h-20 w-20"
                            onContextMenu={(event) =>
                              openProfileContextMenu(
                                event,
                                directConversation.friend,
                              )
                            }
                          />
                          <h2 className="text-3xl font-semibold">
                            {getDisplayName(directConversation.friend)}
                          </h2>
                          <p className="text-connect-muted mt-2">
                            @{directConversation.friend.userId}{" "}
                            とのDMの始まりです。
                          </p>
                        </div>
                      </div>
                    )}

                  {!isFriendsOpen &&
                    directConversation &&
                    hasDirectMessages && (
                      <div>
                        {conversation.hasNextPage && (
                          <div className="flex justify-center pb-4">
                            <button
                              type="button"
                              onClick={() => void conversation.fetchNextPage()}
                              disabled={conversation.isFetchingNextPage}
                              className="border-connect-ink/15 bg-connect-surface text-connect-muted hover:bg-connect-paper min-h-9 rounded-md border px-3 text-sm font-semibold transition disabled:opacity-50"
                            >
                              {conversation.isFetchingNextPage
                                ? "読み込み中..."
                                : "過去のメッセージを読み込む"}
                            </button>
                          </div>
                        )}
                        {directMessages.map((chatMessage, messageIndex) => {
                          const isMine =
                            chatMessage.senderId ===
                            directConversation.currentUserId;
                          const author = isMine
                            ? directConversation.currentUser
                            : directConversation.friend;
                          const isEditing =
                            editingMessage?.kind === "direct" &&
                            editingMessage.messageId === chatMessage.id;
                          const isFollowup = shouldGroupMessage(
                            chatMessage,
                            chatMessage.id === firstDirectUnreadMessageId
                              ? undefined
                              : directMessages[messageIndex - 1],
                          );

                          return (
                            <article
                              key={chatMessage.id}
                              onContextMenu={(event) =>
                                openDirectMessageMenu(event, chatMessage)
                              }
                              className={`group hover:bg-connect-paper relative flex flex-wrap items-start gap-x-3 gap-y-0 rounded-md px-2 ${isFollowup ? "py-0.5" : "py-1.5"}`}
                            >
                              {chatMessage.id ===
                                firstDirectUnreadMessageId && (
                                <NewMessagesSeparator
                                  separatorRef={messageViewport.unreadRef}
                                />
                              )}
                              {isFollowup ? (
                                <time
                                  dateTime={chatMessage.createdAt.toISOString()}
                                  className="text-connect-neutral mt-1 w-10 shrink-0 text-center text-[10px] opacity-0 transition group-hover:opacity-100"
                                  aria-label={`${getDisplayName(author)}、${formatMessageTime(chatMessage.createdAt)}`}
                                >
                                  {formatMessageTime(chatMessage.createdAt)}
                                </time>
                              ) : (
                                <ProfileAvatar
                                  user={author}
                                  className="mt-1 h-10 w-10"
                                  onContextMenu={(event) =>
                                    openProfileContextMenu(event, author)
                                  }
                                />
                              )}
                              <div className="min-w-0 flex-1 text-left">
                                {chatMessage.replyTo && (
                                  <div className="border-connect-action/35 text-connect-muted mb-1 block max-w-full truncate border-l-2 pl-2 text-xs">
                                    {getDisplayName(chatMessage.replyTo.sender)}
                                    : {chatMessage.replyTo.content}
                                  </div>
                                )}
                                {!isFollowup && (
                                  <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                                    <span className="text-connect-ink text-sm font-semibold">
                                      {getDisplayName(author)}
                                    </span>
                                    <time className="text-connect-neutral text-xs">
                                      {formatMessageTime(chatMessage.createdAt)}
                                    </time>
                                  </div>
                                )}
                                {isEditing ? (
                                  <form
                                    onSubmit={handleMessageEditSubmit}
                                    className="space-y-2"
                                  >
                                    <textarea
                                      value={editingMessage.content}
                                      onChange={(event) =>
                                        setEditingMessage({
                                          ...editingMessage,
                                          content: event.target.value,
                                        })
                                      }
                                      className="border-connect-ink/15 bg-connect-surface text-connect-ink min-h-24 w-full resize-y rounded-md border px-3 py-2 text-left leading-6"
                                      maxLength={1000}
                                      autoFocus
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setEditingMessage(null)}
                                        className="border-connect-ink/15 text-connect-muted hover:bg-connect-paper inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition"
                                      >
                                        キャンセル
                                      </button>
                                      <button
                                        type="submit"
                                        disabled={
                                          !editingMessage.content.trim() ||
                                          updateDirectMessage.isPending
                                        }
                                        className="bg-connect-action text-connect-surface hover:bg-connect-action-hover inline-flex min-h-9 items-center rounded-md px-3 text-sm font-semibold transition disabled:opacity-50"
                                      >
                                        保存
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <p className="text-connect-ink text-left leading-7 break-words whitespace-pre-wrap">
                                    <MessageText
                                      content={chatMessage.content}
                                      onOpenLink={setPendingExternalLink}
                                    />
                                  </p>
                                )}
                                <MessageAttachmentList
                                  attachments={chatMessage.attachments}
                                />
                                {chatMessage.reactions.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {groupReactions(chatMessage.reactions).map(
                                      ([emoji, reactions]) => (
                                        <button
                                          key={emoji}
                                          type="button"
                                          onClick={() =>
                                            toggleDirectReaction.mutate({
                                              emoji: emoji as "\u{1F44D}",
                                              messageId: chatMessage.id,
                                            })
                                          }
                                          className="border-connect-ink/15 bg-connect-paper min-h-8 rounded-full border px-2 text-xs"
                                        >
                                          {emoji} {reactions.length}
                                        </button>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(event) =>
                                  openDirectMessageMenu(event, chatMessage)
                                }
                                className="text-connect-muted hover:bg-connect-highlight focus-visible:ring-connect-action flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none md:absolute md:top-1 md:right-2"
                                aria-label="メッセージ操作"
                                aria-haspopup="menu"
                                aria-expanded={
                                  messageContextMenu?.kind === "direct" &&
                                  messageContextMenu.messageId ===
                                    chatMessage.id
                                }
                              >
                                <Settings
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              </button>
                            </article>
                          );
                        })}
                        {activeDirectPendingMessages.map(
                          (pendingMessage, pendingIndex) => (
                            <PendingMessageRow
                              key={pendingMessage.clientId}
                              author={directConversation.currentUser}
                              isFollowup={shouldGroupPendingMessage(
                                pendingMessage,
                                activeDirectPendingMessages[pendingIndex - 1],
                                directMessages.at(-1),
                                directConversation.currentUserId,
                              )}
                              message={pendingMessage}
                              onOpenLink={setPendingExternalLink}
                            />
                          ),
                        )}
                        <div ref={messageViewport.endRef} />
                      </div>
                    )}
                </>
              )}
            </div>
            {messageViewport.newMessageCount > 0 && (
              <div className="pointer-events-none relative z-20 -mt-14 flex h-14 shrink-0 items-center justify-end px-4">
                <button
                  type="button"
                  onClick={messageViewport.scrollToNewMessages}
                  className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 focus-visible:ring-connect-action pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold shadow-lg transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  新しいメッセージ {messageViewport.newMessageCount}件
                </button>
              </div>
            )}

            <div className="shrink-0 px-4 pb-5">
              {selectedServer ? (
                <>
                  {serverMessage && (
                    <p className="border-connect-signal/25 bg-connect-danger-soft text-connect-danger mb-2 rounded-md border px-3 py-2 text-sm">
                      {serverMessage}
                    </p>
                  )}
                  {replyTarget?.kind === "server" &&
                    canSendSelectedServerMessages && (
                      <div className="border-connect-ink/15 bg-connect-highlight flex items-center justify-between rounded-t-md border px-3 py-2 text-sm">
                        <span className="truncate">
                          返信: {replyTarget.content}
                        </span>
                        <button
                          type="button"
                          onClick={() => setReplyTarget(null)}
                          className="flex h-9 w-9 items-center justify-center"
                          aria-label="返信を解除"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  {canSendSelectedServerMessages && (
                    <div className="border-connect-ink/15 bg-connect-surface mb-2 rounded-md border p-3">
                      <MessageAttachmentPicker
                        attachments={serverAttachments}
                        disabled={sendServerMessage.isPending}
                        onChange={setServerAttachments}
                        onError={setServerMessage}
                      />
                    </div>
                  )}
                  <form
                    onSubmit={handleServerSubmit}
                    className={`border-connect-ink/15 bg-connect-paper flex items-end gap-2 border px-3 py-1.5 ${replyTarget?.kind === "server" && canSendSelectedServerMessages ? "rounded-b-md" : "rounded-md"}`}
                  >
                    <textarea
                      data-chat-input
                      value={serverDraft}
                      onChange={(event) =>
                        handleServerDraftChange(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      className="text-connect-ink placeholder:text-connect-placeholder max-h-36 min-h-10 flex-1 resize-none bg-transparent py-2 leading-6 outline-none focus:outline-none focus-visible:outline-none"
                      placeholder={
                        canSendSelectedServerMessages
                          ? `#${selectedServerChannel?.name ?? "general"} へメッセージを送信`
                          : "閲覧のみのためメッセージを送信できません"
                      }
                      disabled={
                        !selectedServerChannel?.id ||
                        !canSendSelectedServerMessages
                      }
                      maxLength={1000}
                    />
                    <button
                      type="submit"
                      disabled={
                        !selectedServerChannel?.id ||
                        !canSendSelectedServerMessages ||
                        (!serverDraft.trim() && serverAttachments.length === 0)
                      }
                      className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="送信"
                    >
                      <Send className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </form>
                </>
              ) : isFriendsOpen ? null : (
                <>
                  {isMatchingOpen ? (
                    <>
                      {matchingMessage && (
                        <p className="border-connect-ink/10 bg-connect-surface text-connect-muted mb-2 rounded-md border px-3 py-2 text-sm">
                          {matchingMessage}
                        </p>
                      )}
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          handleStartMatching();
                        }}
                        className="border-connect-ink/15 bg-connect-surface grid gap-3 rounded-lg border px-4 py-3 shadow-[6px_6px_0_var(--color-focus-on-dark)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                      >
                        <div className="border-connect-ink/10 bg-connect-highlight space-y-2 rounded-md border p-3 sm:col-span-2">
                          <p className="text-sm font-semibold">
                            {
                              MATCHING_TOPICS.find(
                                ({ value }) => value === matchingTopic,
                              )?.prompts[0]
                            }
                          </p>
                          <p className="text-connect-muted text-xs leading-5">
                            {MATCHING_SAFETY_NOTICE}
                          </p>
                          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
                            <input
                              type="checkbox"
                              checked={matchingSafetyAccepted}
                              onChange={(event) =>
                                setMatchingSafetyAccepted(event.target.checked)
                              }
                              disabled={matchingState === "waiting"}
                              className="accent-connect-action h-5 w-5"
                            />
                            内容を確認し、会話を始めることに同意します
                          </label>
                          <a
                            href={SAFETY_RESOURCES.officialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-connect-action inline-flex min-h-10 items-center text-xs font-semibold underline"
                          >
                            相談先と安全情報を確認
                          </a>
                        </div>
                        <select
                          value={matchingTopic}
                          onChange={(event) =>
                            setMatchingTopic(
                              event.target.value as MatchingTopic,
                            )
                          }
                          disabled={matchingState === "waiting"}
                          className="border-connect-ink/15 bg-connect-surface text-connect-ink min-h-11 flex-1 rounded-md border px-3 disabled:opacity-50"
                          aria-label="話したいこと"
                        >
                          {MATCHING_TOPICS.map((topic) => (
                            <option key={topic.value} value={topic.value}>
                              {topic.label}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={
                              matchRandom.isPending ||
                              !matchingSafetyAccepted ||
                              matchingState === "waiting"
                            }
                            className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-4 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                          >
                            <Shuffle className="h-5 w-5" aria-hidden="true" />
                            {matchingState === "waiting"
                              ? "待機中"
                              : matchRandom.isPending
                                ? "検索中"
                                : "マッチング"}
                          </button>
                          {matchingState === "waiting" && (
                            <button
                              type="button"
                              onClick={handleCancelMatching}
                              disabled={cancelMatching.isPending}
                              className="text-connect-muted hover:bg-connect-navigation hover:text-connect-ink flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition disabled:opacity-50"
                              aria-label="マッチングをキャンセル"
                              title="キャンセル"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </form>
                    </>
                  ) : selectedFriendId ? (
                    <>
                      {privateMatchFeedback?.needsRating && (
                        <section className="border-connect-action/20 bg-connect-success-soft mb-3 rounded-lg border p-4">
                          <p className="text-connect-ink font-semibold">
                            今回のマッチングはいかがでしたか？
                          </p>
                          <p className="text-connect-muted mt-1 text-xs">
                            評価内容は誰にも表示されず、今後のマッチング改善にのみ使用されます。
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(
                              [
                                ["NEGATIVE", "合わなかった"],
                                ["NEUTRAL", "普通"],
                                ["POSITIVE", "また話したい"],
                              ] as const satisfies readonly (readonly [
                                MatchingRating,
                                string,
                              ])[]
                            ).map(([rating, label]) => (
                              <button
                                key={rating}
                                type="button"
                                onClick={() =>
                                  submitMatchRating.mutate({
                                    matchId: privateMatchFeedback.matchId,
                                    rating,
                                  })
                                }
                                disabled={submitMatchRating.isPending}
                                className="border-connect-action/20 bg-connect-surface text-connect-action hover:bg-connect-focus-soft min-h-10 rounded-md border px-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-50"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </section>
                      )}
                      {privateMatchFeedback?.needsConversationConsent && (
                        <section className="border-connect-action/20 bg-connect-success-soft mb-3 rounded-lg border p-4">
                          <p className="text-connect-ink font-semibold">
                            この会話を次回のマッチング品質向上の為に使用しますか？
                          </p>
                          <p className="text-connect-muted mt-1 text-xs">
                            同意した場合も、分析するのはあなた自身の発言だけです。会話本文や分析結果は相手に表示されません。
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                submitConversationAnalysisConsent.mutate({
                                  consent: true,
                                  matchId: privateMatchFeedback.matchId,
                                })
                              }
                              disabled={
                                submitConversationAnalysisConsent.isPending
                              }
                              className="border-connect-action/20 bg-connect-surface text-connect-action hover:bg-connect-focus-soft min-h-10 rounded-md border px-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-50"
                            >
                              使用する
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                submitConversationAnalysisConsent.mutate({
                                  consent: false,
                                  matchId: privateMatchFeedback.matchId,
                                })
                              }
                              disabled={
                                submitConversationAnalysisConsent.isPending
                              }
                              className="border-connect-action/20 bg-connect-surface text-connect-action hover:bg-connect-focus-soft min-h-10 rounded-md border px-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-50"
                            >
                              使用しない
                            </button>
                          </div>
                        </section>
                      )}
                      {message && (
                        <p className="border-connect-signal/25 bg-connect-danger-soft text-connect-danger mb-2 rounded-md border px-3 py-2 text-sm">
                          {message}
                        </p>
                      )}
                      {replyTarget?.kind === "direct" && (
                        <div className="border-connect-ink/15 bg-connect-highlight flex items-center justify-between rounded-t-md border px-3 py-2 text-sm">
                          <span className="truncate">
                            返信: {replyTarget.content}
                          </span>
                          <button
                            type="button"
                            onClick={() => setReplyTarget(null)}
                            className="flex h-9 w-9 items-center justify-center"
                            aria-label="返信を解除"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      {canSendDirectMessage && (
                        <div className="border-connect-ink/15 bg-connect-surface mb-2 rounded-md border p-3">
                          <MessageAttachmentPicker
                            attachments={directAttachments}
                            disabled={sendMessage.isPending}
                            onChange={setDirectAttachments}
                            onError={setMessage}
                          />
                        </div>
                      )}
                      <div className="text-connect-neutral mb-2 min-h-5 px-1 text-sm">
                        {typingUserName
                          ? `${typingUserName} が入力中...`
                          : canSendDirectMessage
                            ? null
                            : "フレンドではないため、新しいメッセージは送信できません"}
                      </div>
                      <form
                        onSubmit={handleSubmit}
                        className={`border-connect-ink/15 bg-connect-paper flex items-end gap-2 border px-3 py-1.5 ${replyTarget?.kind === "direct" ? "rounded-b-md" : "rounded-md"}`}
                      >
                        <textarea
                          data-chat-input
                          value={draft}
                          onChange={(event) =>
                            handleDraftChange(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === "Enter" &&
                              !event.shiftKey &&
                              !event.nativeEvent.isComposing
                            ) {
                              event.preventDefault();
                              event.currentTarget.form?.requestSubmit();
                            }
                          }}
                          className="text-connect-ink placeholder:text-connect-placeholder max-h-36 min-h-10 flex-1 resize-none bg-transparent py-2 leading-6 outline-none focus:outline-none focus-visible:outline-none"
                          placeholder={
                            !canSendDirectMessage
                              ? "この会話には送信できません"
                              : selectedFriend
                                ? `${getDisplayName(selectedFriend)} へメッセージを送信`
                                : "フレンドを選択してください"
                          }
                          disabled={!selectedFriendId || !canSendDirectMessage}
                          maxLength={1000}
                        />
                        <button
                          type="submit"
                          disabled={
                            !selectedFriendId ||
                            !canSendDirectMessage ||
                            (!draft.trim() && directAttachments.length === 0)
                          }
                          className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="送信"
                        >
                          <Send className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </form>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {selectedServer && (
            <ServerMemberList
              currentUserId={currentServerUser?.id}
              currentRole={selectedServer.role}
              isOpen={isMemberListOpen}
              isRemoving={removeServerMember.isPending}
              isUpdatingRole={updateServerMemberRole.isPending}
              members={selectedServerMembers}
              onClose={() => setIsMemberListOpen(false)}
              onProfileContextMenu={openProfileContextMenu}
              onRemove={handleRemoveServerMember}
              onUpdateRole={handleUpdateServerMemberRole}
              serverId={selectedServer.server.id}
            />
          )}
        </div>
      </section>

      <Dialog
        open={isServerSettingsOpen}
        onOpenChange={(isOpen) => {
          setIsServerSettingsOpen(isOpen);
          if (!isOpen) {
            setServerIconFile(null);
            setServerSettingsMessage(null);
          }
        }}
      >
        <DialogContent className="bg-connect-paper text-connect-ink max-h-[92dvh] overflow-y-auto p-0 sm:max-w-lg">
          <DialogHeader className="border-connect-ink/15 border-b px-5 py-4">
            <DialogTitle>サーバー設定</DialogTitle>
            <DialogDescription className="sr-only">
              サーバー名、アイコン、招待リンクを管理します。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleServerSettingsSubmit} className="space-y-5 p-5">
            <div className="flex items-center gap-4">
              <div className="bg-connect-ink text-connect-paper flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md text-lg font-semibold">
                {selectedServer?.server.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedServer.server.image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  selectedServer?.server.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-sm font-semibold">
                  サーバーアイコン
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(event) =>
                    setServerIconFile(event.target.files?.[0] ?? null)
                  }
                  className="text-connect-muted file:bg-connect-ink file:text-connect-paper block w-full text-sm file:mr-3 file:min-h-9 file:rounded-md file:border-0 file:px-3 file:font-semibold"
                />
                <span className="text-connect-neutral mt-1 block text-xs">
                  PNG / JPG、128KBまで
                </span>
                {serverIconFile && (
                  <span className="text-connect-neutral mt-1 block truncate text-xs">
                    {serverIconFile.name}
                  </span>
                )}
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold">
                サーバー名
              </span>
              <input
                value={serverNameDraft}
                onChange={(event) => setServerNameDraft(event.target.value)}
                className="border-connect-ink/15 bg-connect-surface text-connect-ink min-h-11 w-full rounded-md border px-3"
                maxLength={50}
                required
              />
            </label>

            <fieldset className="border-connect-ink/15 space-y-3 rounded-md border p-4">
              <legend className="px-1 text-sm font-semibold">
                公開サーバーディレクトリ
              </legend>
              <label className="flex min-h-11 items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-semibold">公開する</span>
                  <span className="text-connect-muted block text-xs">
                    名前・説明・カテゴリ・タグ・人数から検索できます
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={serverVisibilityDraft === "PUBLIC"}
                  onChange={(event) =>
                    setServerVisibilityDraft(
                      event.target.checked ? "PUBLIC" : "PRIVATE",
                    )
                  }
                  className="accent-connect-action h-5 w-5"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold">
                  カテゴリ
                  <select
                    value={serverCategoryDraft}
                    onChange={(event) =>
                      setServerCategoryDraft(
                        event.target.value as ServerCategory | "",
                      )
                    }
                    className="border-connect-ink/15 bg-connect-surface mt-1 min-h-11 w-full rounded-md border px-3"
                  >
                    <option value="">未設定</option>
                    <option value="COMMUNITY">コミュニティ</option>
                    <option value="GAMES">ゲーム</option>
                    <option value="STUDY">学習</option>
                    <option value="HOBBIES">趣味</option>
                    <option value="WELLBEING">ウェルビーイング</option>
                    <option value="OTHER">その他</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  タグ（最大5件）
                  <input
                    value={serverTagsDraft}
                    onChange={(event) => setServerTagsDraft(event.target.value)}
                    placeholder="初心者歓迎, 音楽"
                    className="border-connect-ink/15 bg-connect-surface mt-1 min-h-11 w-full rounded-md border px-3"
                  />
                </label>
              </div>
            </fieldset>

            {selectedServer?.server.inviteCode && (
              <div>
                <span className="mb-1 block text-sm font-semibold">
                  招待リンク
                </span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={`/servers/invite/${selectedServer.server.inviteCode}`}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                    className="border-connect-ink/15 bg-connect-surface text-connect-muted min-h-11 min-w-0 flex-1 rounded-md border px-3 text-sm"
                    aria-label="招待リンク"
                  />
                  <button
                    type="button"
                    onClick={handleCopyServerInvite}
                    className="border-connect-ink/15 bg-connect-surface hover:bg-connect-highlight inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 font-semibold transition"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    コピー
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      rotateServerInvite.mutate({
                        serverId: selectedServer.server.id,
                      })
                    }
                    disabled={rotateServerInvite.isPending}
                    className="border-connect-ink/15 bg-connect-surface hover:bg-connect-highlight inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 font-semibold transition disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    再発行
                  </button>
                </div>
              </div>
            )}

            {serverSettingsMessage && (
              <p
                className={`rounded-md border px-3 py-2 text-sm ${
                  [
                    "サーバー設定を保存しました",
                    "招待リンクをコピーしました",
                    "招待リンクを再発行しました",
                  ].includes(serverSettingsMessage)
                    ? "border-connect-action/20 bg-connect-success-soft text-connect-action"
                    : "border-connect-signal/25 bg-connect-danger-soft text-connect-danger"
                }`}
              >
                {serverSettingsMessage}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              {isSelectedServerOwner && (
                <button
                  type="button"
                  onClick={handleDeleteServer}
                  disabled={deleteServer.isPending}
                  className="border-connect-signal/25 bg-connect-danger-soft text-connect-danger hover:bg-connect-danger-hover inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 font-semibold transition disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  サーバー削除
                </button>
              )}
              <button
                type="submit"
                disabled={
                  !serverNameDraft.trim() ||
                  updateServer.isPending ||
                  updateServerDiscovery.isPending
                }
                className="bg-connect-action text-connect-surface hover:bg-connect-action-hover inline-flex min-h-11 items-center justify-center rounded-md px-4 font-semibold transition disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reportTarget)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setReportTarget(null);
        }}
      >
        <DialogContent className="bg-connect-paper text-connect-ink sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>メッセージを通報</DialogTitle>
            <DialogDescription>
              内容を確認し、通報理由を選んでください。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMessageReportSubmit} className="space-y-4">
            <p className="border-connect-ink/15 bg-connect-surface text-connect-muted max-h-28 overflow-y-auto rounded-md border px-3 py-2 text-sm break-words whitespace-pre-wrap">
              {reportTarget?.content}
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">通報理由</span>
              <select
                value={reportReason}
                onChange={(event) =>
                  setReportReason(event.target.value as ReportReason)
                }
                className="border-connect-ink/15 bg-connect-surface min-h-11 w-full rounded-md border px-3"
              >
                {reportReasons.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">
                詳細（任意）
              </span>
              <textarea
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                className="border-connect-ink/15 bg-connect-surface min-h-28 w-full resize-y rounded-md border px-3 py-2"
                maxLength={500}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="border-connect-ink/15 bg-connect-surface hover:bg-connect-highlight inline-flex min-h-11 items-center justify-center rounded-md border px-4 font-semibold transition"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={submitMessageReport.isPending}
                className="bg-connect-danger text-connect-surface hover:bg-connect-danger-strong inline-flex min-h-11 items-center justify-center rounded-md px-4 font-semibold transition disabled:opacity-50"
              >
                {submitMessageReport.isPending ? "送信中..." : "通報する"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isServerReportsOpen} onOpenChange={setIsServerReportsOpen}>
        <DialogContent className="bg-connect-paper text-connect-ink max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>サーバーの通報一覧</DialogTitle>
            <DialogDescription>
              メンバーから届いた通報を確認済みにできます。
            </DialogDescription>
          </DialogHeader>
          {serverReports.isLoading ? (
            <p className="text-connect-muted py-8 text-center text-sm">
              読み込み中...
            </p>
          ) : serverReports.error ? (
            <p
              className="border-connect-signal/25 bg-connect-danger-soft text-connect-danger rounded-md border px-3 py-2 text-sm"
              role="alert"
            >
              {getErrorMessage(serverReports.error)}
            </p>
          ) : serverReports.data?.length ? (
            <div className="space-y-3">
              {serverReports.data.map((report) => (
                <article
                  key={report.id}
                  className="border-connect-ink/15 bg-connect-surface rounded-md border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {report.reportedUser?.name ??
                          (report.reportedUser
                            ? `@${report.reportedUser.userId}`
                            : "削除されたユーザー")}
                      </p>
                      <p className="text-connect-neutral text-xs">
                        {report.createdAt.toLocaleString("ja-JP")}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        report.status === "REVIEWED"
                          ? "bg-connect-highlight text-connect-action"
                          : "bg-connect-danger-soft text-connect-danger"
                      }`}
                    >
                      {report.status === "REVIEWED" ? "確認済み" : "未確認"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold">
                    {reportReasons.find(
                      (reason) => reason.value === report.reason,
                    )?.label ?? report.reason}
                  </p>
                  <p className="bg-connect-paper text-connect-muted mt-2 rounded-md px-3 py-2 text-sm break-words whitespace-pre-wrap">
                    {report.contentSnapshot}
                  </p>
                  {report.details && (
                    <p className="text-connect-muted mt-2 text-sm break-words whitespace-pre-wrap">
                      詳細: {report.details}
                    </p>
                  )}
                  {report.status !== "REVIEWED" && selectedServerId && (
                    <button
                      type="button"
                      onClick={() =>
                        markServerReportReviewed.mutate({
                          reportId: report.id,
                          serverId: selectedServerId,
                        })
                      }
                      disabled={markServerReportReviewed.isPending}
                      className="bg-connect-action text-connect-surface hover:bg-connect-action-hover mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      確認済みにする
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="text-connect-muted py-8 text-center text-sm">
              通報はありません。
            </p>
          )}
        </DialogContent>
      </Dialog>

      <PinnedMessagesDialog
        isLoading={serverConversation.isLoading}
        messages={serverConversationData?.pinnedMessages}
        onOpenChange={setIsPinnedMessagesOpen}
        onOpenLink={setPendingExternalLink}
        onProfileContextMenu={openProfileContextMenu}
        open={isPinnedMessagesOpen}
        serverId={selectedServer?.server.id}
      />

      <ExternalLinkDialog
        onClose={() => setPendingExternalLink(null)}
        url={pendingExternalLink}
      />

      {moderationNotice && (
        <div
          className={`fixed right-4 bottom-4 z-[100] flex max-w-sm items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-xl ${
            moderationNotice.kind === "success"
              ? "border-connect-action/20 bg-connect-highlight text-connect-action"
              : "border-connect-signal/25 bg-connect-danger-soft text-connect-danger"
          }`}
          role={moderationNotice.kind === "success" ? "status" : "alert"}
        >
          <span className="flex-1">{moderationNotice.text}</span>
          <button
            type="button"
            onClick={() => setModerationNotice(null)}
            className="hover:bg-connect-ink/5 rounded p-0.5 transition"
            aria-label="通知を閉じる"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {canManageSelectedChannels &&
        channelContextMenu &&
        channelContextTarget &&
        selectedServer && (
          <div
            ref={contextMenuRef}
            className="border-connect-ink/15 bg-connect-surface text-connect-ink fixed z-50 w-48 rounded-md border p-1 text-sm shadow-xl"
            style={{ left: channelContextMenu.x, top: channelContextMenu.y }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) =>
              handleContextMenuKeyDown(event, () => setChannelContextMenu(null))
            }
            role="menu"
          >
            <button
              type="button"
              onClick={() => openChannelEditor(channelContextTarget)}
              className="hover:bg-connect-highlight flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition"
              role="menuitem"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              編集
            </button>
            <button
              type="button"
              onClick={() => handleDeleteChannel(channelContextTarget.id)}
              disabled={
                selectedServer.server.channels.length <= 1 ||
                deleteChannel.isPending
              }
              className="text-connect-danger hover:bg-connect-danger-soft flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45"
              role="menuitem"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              削除
            </button>
          </div>
        )}

      {profileContextMenu && (
        <div
          ref={contextMenuRef}
          className="border-connect-ink/15 bg-connect-surface text-connect-ink fixed z-50 w-48 rounded-md border p-1 text-sm shadow-xl"
          style={{ left: profileContextMenu.x, top: profileContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) =>
            handleContextMenuKeyDown(event, () => setProfileContextMenu(null))
          }
          role="menu"
          aria-label={`${getDisplayName(profileContextMenu)}のプロフィール操作`}
        >
          <button
            type="button"
            onClick={handleBlockUser}
            disabled={blockUser.isPending}
            className="text-connect-danger hover:bg-connect-danger-soft flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition disabled:cursor-wait disabled:opacity-45"
            role="menuitem"
          >
            <Ban className="h-4 w-4" aria-hidden="true" />
            {blockUser.isPending ? "ブロック中..." : "ブロック"}
          </button>
        </div>
      )}

      {messageContextMenu && messageContextTarget && (
        <div
          ref={contextMenuRef}
          className="border-connect-ink/15 bg-connect-surface text-connect-ink fixed z-50 w-48 rounded-md border p-1 text-sm shadow-xl"
          style={{ left: messageContextMenu.x, top: messageContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) =>
            handleContextMenuKeyDown(event, () => setMessageContextMenu(null))
          }
          role="menu"
        >
          {(messageContextMenu.kind === "direct" ||
            canSendSelectedServerMessages) && (
            <>
              <button
                type="button"
                onClick={startReply}
                className="hover:bg-connect-highlight flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition"
                role="menuitem"
              >
                <Reply className="h-4 w-4" aria-hidden="true" />
                返信
              </button>
              <button
                type="button"
                onClick={quoteContextMessage}
                className="hover:bg-connect-highlight flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition"
                role="menuitem"
              >
                <Quote className="h-4 w-4" aria-hidden="true" />
                引用
              </button>
            </>
          )}
          {(messageContextMenu.kind === "direct" ||
            canReactToSelectedServerMessages) && (
            <div
              className="flex min-h-10 items-center gap-1 px-2"
              aria-label="リアクション"
            >
              {(
                [
                  "\u{1F44D}",
                  "\u{2764}\u{FE0F}",
                  "\u{1F602}",
                  "\u{1F389}",
                  "\u{1F62E}",
                  "\u{1F64F}",
                ] as const
              ).map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => reactToContextMessage(emoji)}
                  className="hover:bg-connect-highlight flex h-8 w-8 items-center justify-center rounded text-sm"
                  role="menuitem"
                  aria-label={`${emoji}でリアクション`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={toggleContextSaved}
            className="hover:bg-connect-highlight flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition"
            role="menuitem"
          >
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            {messageContextTarget.savedBy?.length ? "保存を解除" : "保存"}
          </button>
          <button
            type="button"
            onClick={() => void handleCopyMessage()}
            className="hover:bg-connect-highlight flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition"
            role="menuitem"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            コピー
          </button>
          {canReportContextMessage && (
            <button
              type="button"
              onClick={openMessageReport}
              className="text-connect-danger hover:bg-connect-danger-soft flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition"
              role="menuitem"
            >
              <Flag className="h-4 w-4" aria-hidden="true" />
              通報
            </button>
          )}
          {serverMessageContextTarget && canManageSelectedReports && (
            <button
              type="button"
              onClick={() =>
                handleToggleServerMessagePin(serverMessageContextTarget.id)
              }
              disabled={toggleServerMessagePin.isPending}
              className="hover:bg-connect-highlight flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition disabled:opacity-45"
              role="menuitem"
            >
              <Pin className="h-4 w-4" aria-hidden="true" />
              {serverMessageContextTarget.pinnedAt
                ? "ピン留め解除"
                : "ピン留め"}
            </button>
          )}
          {canEditContextMessage && (
            <button
              type="button"
              onClick={() =>
                startEditingMessage(
                  messageContextMenu.kind,
                  messageContextTarget,
                )
              }
              className="hover:bg-connect-highlight flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition"
              role="menuitem"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              編集
            </button>
          )}
          {canDeleteContextMessage && (
            <button
              type="button"
              onClick={() =>
                messageContextMenu.kind === "server"
                  ? handleDeleteServerMessage(messageContextTarget.id)
                  : handleDeleteDirectMessage(messageContextTarget.id)
              }
              disabled={
                messageContextMenu.kind === "server"
                  ? deleteServerMessage.isPending
                  : deleteDirectMessage.isPending
              }
              className="text-connect-danger hover:bg-connect-danger-soft flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45"
              role="menuitem"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              削除
            </button>
          )}
        </div>
      )}
    </main>
  );
}
