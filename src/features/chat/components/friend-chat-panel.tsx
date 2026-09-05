"use client";

import {
  Ban,
  Bookmark,
  Check,
  ChevronDown,
  Copy,
  Ellipsis,
  Flag,
  Hash,
  Inbox,
  LogOut,
  Menu,
  MessageCircle,
  Pencil,
  Pin,
  Plus,
  Quote,
  RefreshCw,
  Reply,
  Search,
  Settings,
  Shuffle,
  Trash2,
  Users,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  ChatComposer,
  type ChatComposerHandle,
  type ChatComposerSubmission,
} from "~/features/chat/components/chat-composer";
import {
  Avatar,
  getDisplayName,
  getServerDisplayName,
  PendingMessageRow,
  ProfileAvatar,
} from "~/features/chat/components/chat-message";
import { MessageRow } from "~/features/chat/components/message-row";
import { useMessageViewport } from "~/features/chat/components/use-message-viewport";
import { matchesFriendSearch } from "~/features/chat/friend-search";
import {
  MATCHING_SAFETY_NOTICE,
  MATCHING_TOPICS,
  SAFETY_RESOURCES,
  type MatchingTopic,
} from "~/features/chat/matching-prompts";
import { shouldGroupMessage } from "~/features/chat/message-grouping";
import {
  createMessageEventQueue,
  updateMessagePages,
} from "~/features/chat/realtime-messages";
import {
  getPresenceDisplayLabel,
  getPresenceDotClassName,
} from "~/features/profile/presence";
import { PresenceStatusMenu } from "~/features/profile/components/presence-status-menu";
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
import type { ChatEvent as ChatEventPayload } from "~/server/chat-events";

const ExternalLinkDialog = dynamic(() =>
  import("~/features/chat/components/chat-dialogs").then(
    ({ ExternalLinkDialog }) => ExternalLinkDialog,
  ),
);
const FriendPanel = dynamic(() =>
  import("~/features/friend/components/friend-panel").then(
    ({ FriendPanel }) => FriendPanel,
  ),
);
const GlobalSearchDialog = dynamic(() =>
  import("~/features/chat/components/global-search-dialog").then(
    ({ GlobalSearchDialog }) => GlobalSearchDialog,
  ),
);
const GroupDmDialog = dynamic(() =>
  import("~/features/group/components/group-dm-dialog").then(
    ({ GroupDmDialog }) => GroupDmDialog,
  ),
);
const PinnedMessagesDialog = dynamic(() =>
  import("~/features/chat/components/chat-dialogs").then(
    ({ PinnedMessagesDialog }) => PinnedMessagesDialog,
  ),
);
const ProfileSettingsDialog = dynamic(() =>
  import("~/features/profile/components/profile-settings-dialog").then(
    ({ ProfileSettingsDialog }) => ProfileSettingsDialog,
  ),
);
const ServerMemberList = dynamic(() =>
  import("~/features/chat/components/server-member-list").then(
    ({ ServerMemberList }) => ServerMemberList,
  ),
);
const UserProfileDialog = dynamic(() =>
  import("~/features/profile/components/user-profile-dialog").then(
    ({ UserProfileDialog }) => UserProfileDialog,
  ),
);

type ChatFriend = RouterOutputs["chat"]["getFriends"][number];
type ChatGroup = RouterOutputs["group"]["list"]["groups"][number];
type ChatServerMembership =
  RouterOutputs["server"]["getOverview"]["memberships"][number];
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

const FriendListItem = memo(
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
  },
  (previous, next) =>
    previous.item === next.item && previous.selected === next.selected,
);

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
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const [matchingTopic, setMatchingTopic] = useState<MatchingTopic>("CASUAL");
  const [matchingState, setMatchingState] = useState<"idle" | "waiting">(
    "idle",
  );
  const [matchingMessage, setMatchingMessage] = useState<string | null>(null);
  const [matchingSafetyAccepted, setMatchingSafetyAccepted] = useState(false);
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
  const [profileDialogTarget, setProfileDialogTarget] = useState<{
    serverId?: string;
    userId: string;
  } | null>(null);
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
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const directComposerRef = useRef<ChatComposerHandle | null>(null);
  const serverComposerRef = useRef<ChatComposerHandle | null>(null);
  const selectedChatRef = useRef({
    friendId: selectedFriendId,
    serverChannelId: selectedServerChannelId,
    serverChannelName: null as string | null,
    serverId: selectedServerId,
  });

  const friends = api.chat.getFriends.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.status === "error"
        ? false
        : matchingState === "waiting" || !isRealtimeConnected
          ? 5000
          : 15000,
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
      query.state.status === "error" ? false : 15000,
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
        !isMemberListOpen || query.state.status === "error" ? false : 15000,
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
              ? false
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
              ? false
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
    selectedChatRef.current = {
      friendId: selectedFriendId,
      serverChannelId: selectedServerChannel?.id ?? null,
      serverChannelName: selectedServerChannel?.name ?? null,
      serverId: selectedServerId,
    };
  }, [
    selectedFriendId,
    selectedServerChannel?.id,
    selectedServerChannel?.name,
    selectedServerId,
  ]);

  useEffect(() => {
    const events = new EventSource("/api/chat/events");
    const enqueueMessage = createMessageEventQueue();
    let disposed = false;
    events.onopen = () => {
      setIsRealtimeConnected(true);
      void utils.chat.getFriends.invalidate();
      void utils.server.getOverview.invalidate();
      void utils.group.list.invalidate();
      void utils.group.getConversation.invalidate();
      const selection = selectedChatRef.current;
      if (selection.friendId) {
        void utils.chat.getConversation.invalidate({
          friendId: selection.friendId,
        });
      }
      if (selection.serverId && selection.serverChannelId) {
        void utils.server.getConversation.invalidate({
          channelId: selection.serverChannelId,
          serverId: selection.serverId,
        });
      }
      if (selection.serverId) {
        void utils.server.getMembers.invalidate({
          serverId: selection.serverId,
        });
      }
    };
    events.onerror = () => setIsRealtimeConnected(false);
    const handleChatEvent = async (payload: ChatEventPayload) => {
      if (disposed) return;
      if (payload.kind === "direct") {
        void utils.chat.getFriends.invalidate();
        const friendId = selectedChatRef.current.friendId;
        if (!friendId || !payload.userIds.includes(friendId)) return;

        if (payload.change === "deleted") {
          utils.chat.getConversation.setInfiniteData({ friendId }, (data) =>
            data
              ? {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    messages: page.messages.filter(
                      ({ id }) => id !== payload.messageId,
                    ),
                  })),
                }
              : data,
          );
          return;
        }

        const messageInput = { messageId: payload.messageId };
        const latestMessage = await utils.chat.getMessage
          .invalidate(messageInput)
          .then(() => utils.chat.getMessage.fetch(messageInput))
          .catch(() => {
            void utils.chat.getConversation.invalidate({ friendId });
            return null;
          });
        if (!latestMessage || disposed) return;
        const change = payload.change;
        utils.chat.getConversation.setInfiniteData({ friendId }, (data) => {
          if (!data) return data;
          const pages = updateMessagePages(data.pages, latestMessage, change);
          return { ...data, pages };
        });
        return;
      }

      if (payload.kind === "server") {
        const selection = selectedChatRef.current;
        const isSelectedChannel =
          payload.serverId === selection.serverId &&
          (payload.channelId === selection.serverChannelId ||
            (payload.channelId === null &&
              selection.serverChannelName === "general"));

        if (isSelectedChannel && selection.serverChannelId) {
          const input = {
            channelId: selection.serverChannelId,
            serverId: payload.serverId,
          };
          if (payload.change === "deleted") {
            utils.server.getConversation.setInfiniteData(input, (data) =>
              data
                ? {
                    ...data,
                    pages: data.pages.map((page) => ({
                      ...page,
                      messages: page.messages.filter(
                        ({ id }) => id !== payload.messageId,
                      ),
                    })),
                  }
                : data,
            );
            utils.server.getPinnedMessages.setData(input, (messages) =>
              messages?.filter(({ id }) => id !== payload.messageId),
            );
          } else {
            const messageInput = {
              messageId: payload.messageId,
              serverId: payload.serverId,
            };
            const latestMessage = await utils.server.getMessage
              .invalidate(messageInput)
              .then(() => utils.server.getMessage.fetch(messageInput))
              .catch(() => {
                void utils.server.getConversation.invalidate(input);
                return null;
              });
            if (latestMessage && !disposed) {
              const change = payload.change;
              utils.server.getConversation.setInfiniteData(input, (data) => {
                if (!data) return data;
                const pages = updateMessagePages(
                  data.pages,
                  latestMessage,
                  change,
                );
                return { ...data, pages };
              });
              utils.server.getPinnedMessages.setData(input, (messages) => {
                if (!messages) return messages;
                const remaining = messages.filter(
                  ({ id }) => id !== latestMessage.id,
                );
                return latestMessage.pinnedAt
                  ? [latestMessage, ...remaining]
                  : remaining;
              });
            }
          }
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
        void utils.group.getConversation.invalidate({
          groupId: payload.groupId,
        });
        return;
      }

      if (payload.senderId !== selectedChatRef.current.friendId) return;
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
    const chatEventListener: EventListener = (event) => {
      let payload: ChatEventPayload;
      try {
        payload = JSON.parse(
          (event as MessageEvent<string>).data,
        ) as ChatEventPayload;
      } catch {
        return;
      }
      const task =
        payload.kind === "direct" || payload.kind === "server"
          ? enqueueMessage(`${payload.kind}:${payload.messageId}`, () =>
              handleChatEvent(payload),
            )
          : handleChatEvent(payload);
      void task.catch(() => {
        if (disposed) return;
        void utils.chat.getConversation.invalidate();
        void utils.server.getConversation.invalidate();
        void utils.group.getConversation.invalidate();
      });
    };
    events.addEventListener("chat", chatEventListener);

    return () => {
      disposed = true;
      events.close();
      setIsRealtimeConnected(false);
      if (typingResetTimerRef.current) {
        clearTimeout(typingResetTimerRef.current);
      }
      setTypingUserName(null);
    };
  }, [
    utils.chat.getConversation,
    utils.chat.getFriends,
    utils.chat.getMessage,
    utils.group.list,
    utils.group.getConversation,
    utils.server.getConversation,
    utils.server.getMembers,
    utils.server.getMessage,
    utils.server.getPinnedMessages,
    utils.server.getOverview,
  ]);

  const broadcastTyping = useCallback(
    (isTyping: boolean) => {
      if (!canSendDirectMessage || !selectedFriendId) return;
      publishTyping({ friendId: selectedFriendId, isTyping });
    },
    [canSendDirectMessage, publishTyping, selectedFriendId],
  );

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
    onSuccess: (result) => {
      if (!selectedFriendId) return;
      utils.chat.getConversation.setInfiniteData(
        { friendId: selectedFriendId },
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((chatMessage) =>
                    chatMessage.id !== result.messageId
                      ? chatMessage
                      : {
                          ...chatMessage,
                          reactions: result.reacted
                            ? [
                                ...chatMessage.reactions,
                                {
                                  emoji: result.emoji,
                                  userId: page.currentUserId,
                                },
                              ]
                            : chatMessage.reactions.filter(
                                ({ emoji, userId }) =>
                                  emoji !== result.emoji ||
                                  userId !== page.currentUserId,
                              ),
                        },
                  ),
                })),
              }
            : data,
      );
    },
  });
  const toggleServerReaction = api.server.toggleMessageReaction.useMutation({
    onSuccess: (result, variables) => {
      utils.server.getConversation.setInfiniteData(
        {
          channelId: selectedServerChannel?.id,
          serverId: variables.serverId,
        },
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((chatMessage) =>
                    chatMessage.id !== result.messageId
                      ? chatMessage
                      : {
                          ...chatMessage,
                          reactions: result.reacted
                            ? [
                                ...chatMessage.reactions,
                                {
                                  emoji: result.emoji,
                                  userId: page.currentUser.id,
                                },
                              ]
                            : chatMessage.reactions.filter(
                                ({ emoji, userId }) =>
                                  emoji !== result.emoji ||
                                  userId !== page.currentUser.id,
                              ),
                        },
                  ),
                })),
              }
            : data,
      );
    },
  });
  const toggleSavedMessage = api.chat.toggleSavedMessage.useMutation({
    onSuccess: (result, variables) => {
      if (variables.kind === "DIRECT" && selectedFriendId) {
        utils.chat.getConversation.setInfiniteData(
          { friendId: selectedFriendId },
          (data) =>
            data
              ? {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    messages: page.messages.map((chatMessage) =>
                      chatMessage.id === variables.messageId
                        ? {
                            ...chatMessage,
                            savedBy: result.saved
                              ? [{ userId: page.currentUserId }]
                              : [],
                          }
                        : chatMessage,
                    ),
                  })),
                }
              : data,
        );
      }
      if (variables.kind === "SERVER" && selectedServerId) {
        utils.server.getConversation.setInfiniteData(
          {
            channelId: selectedServerChannel?.id,
            serverId: selectedServerId,
          },
          (data) =>
            data
              ? {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    messages: page.messages.map((chatMessage) =>
                      chatMessage.id === variables.messageId
                        ? {
                            ...chatMessage,
                            savedBy: result.saved
                              ? [{ userId: page.currentUser.id }]
                              : [],
                          }
                        : chatMessage,
                    ),
                  })),
                }
              : data,
        );
      }
      void utils.chat.getSavedMessages.invalidate();
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
    onSuccess: (updatedMessage) => {
      setEditingMessage(null);
      setMessageContextMenu(null);
      setMessage(null);
      if (selectedFriendId) {
        utils.chat.getConversation.setInfiniteData(
          { friendId: selectedFriendId },
          (data) =>
            data
              ? {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    messages: page.messages.map((chatMessage) =>
                      chatMessage.id === updatedMessage.id
                        ? { ...chatMessage, content: updatedMessage.content }
                        : chatMessage,
                    ),
                  })),
                }
              : data,
        );
      }
      void utils.chat.getFriends.invalidate();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const deleteDirectMessage = api.chat.deleteMessage.useMutation({
    onSuccess: (deletedMessage) => {
      setMessageContextMenu(null);
      if (selectedFriendId) {
        utils.chat.getConversation.setInfiniteData(
          { friendId: selectedFriendId },
          (data) =>
            data
              ? {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    messages: page.messages.filter(
                      ({ id }) => id !== deletedMessage.id,
                    ),
                  })),
                }
              : data,
        );
      }
      void utils.chat.getFriends.invalidate();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const updateServerMessage = api.server.updateMessage.useMutation({
    onSuccess: (updatedMessage, variables) => {
      setEditingMessage(null);
      setMessageContextMenu(null);
      setServerMessage(null);
      utils.server.getConversation.setInfiniteData(
        {
          channelId: selectedServerChannel?.id,
          serverId: variables.serverId,
        },
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((chatMessage) =>
                    chatMessage.id === updatedMessage.id
                      ? { ...chatMessage, content: updatedMessage.content }
                      : chatMessage,
                  ),
                })),
              }
            : data,
      );
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

  const toggleServerMessagePin = api.server.toggleMessagePin.useMutation({
    onSuccess: (updatedMessage, variables) => {
      setMessageContextMenu(null);
      setServerMessage(null);
      utils.server.getConversation.setInfiniteData(
        {
          channelId: selectedServerChannel?.id,
          serverId: variables.serverId,
        },
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((chatMessage) =>
                    chatMessage.id === updatedMessage.id
                      ? { ...chatMessage, pinnedAt: updatedMessage.pinnedAt }
                      : chatMessage,
                  ),
                })),
              }
            : data,
      );
      if (selectedServerChannel?.id) {
        void utils.server.getPinnedMessages.invalidate({
          channelId: selectedServerChannel.id,
          serverId: variables.serverId,
        });
      }
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

  const deleteServerMessage = api.server.deleteMessage.useMutation({
    onSuccess: (deletedMessage, variables) => {
      setMessageContextMenu(null);
      utils.server.getConversation.setInfiniteData(
        {
          channelId: selectedServerChannel?.id,
          serverId: variables.serverId,
        },
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  messages: page.messages.filter(
                    ({ id }) => id !== deletedMessage.id,
                  ),
                })),
              }
            : data,
      );
      void utils.server.getOverview.invalidate();
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

  const handleDirectSubmit = async ({
    attachmentIds,
    clientId,
    content,
  }: ChatComposerSubmission) => {
    if (!selectedFriendId || !canSendDirectMessage) return;
    const friendId = selectedFriendId;

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

    const activeReply = replyTarget?.kind === "direct" ? replyTarget : null;
    setReplyTarget(null);
    try {
      const savedMessage = await sendMessage.mutateAsync({
        attachmentIds,
        clientId,
        content,
        friendId,
        replyToId: activeReply?.id,
      });
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
      void utils.chat.getFriends.invalidate();
    } catch (error) {
      setPendingDirectMessages((messages) =>
        messages.filter(
          (pendingMessage) => pendingMessage.clientId !== clientId,
        ),
      );
      setMessage(getErrorMessage(error));
      setReplyTarget(activeReply);
      throw error;
    }
  };

  const handleServerSubmit = async ({
    attachmentIds,
    clientId,
    content,
  }: ChatComposerSubmission) => {
    if (
      !selectedServerId ||
      !selectedServerChannel?.id ||
      !canSendSelectedServerMessages
    ) {
      return;
    }
    const channelId = selectedServerChannel.id;
    const serverId = selectedServerId;

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
    try {
      const savedMessage = await sendServerMessage.mutateAsync({
        attachmentIds,
        channelId,
        clientId,
        content,
        replyToId: activeReply?.id,
        serverId,
      });
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
    } catch (error) {
      setPendingServerMessages((messages) =>
        messages.filter(
          (pendingMessage) => pendingMessage.clientId !== clientId,
        ),
      );
      setServerMessage(getErrorMessage(error));
      setReplyTarget(activeReply);
      throw error;
    }
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
    if (messageContextMenu.kind === "server") {
      serverComposerRef.current?.quote(messageContextTarget.content);
    } else {
      directComposerRef.current?.quote(messageContextTarget.content);
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
      {isGlobalSearchOpen && (
        <GlobalSearchDialog
          open
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
      )}
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
                    className="border-connect-ink/15 bg-connect-surface text-connect-ink placeholder:text-connect-placeholder focus:border-connect-action focus:ring-connect-focus-soft min-h-9 min-w-0 flex-1 rounded-md border px-2 text-sm focus:ring-2 focus:outline-none"
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
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGroupId(undefined);
                    setIsGroupDmOpen(true);
                  }}
                  className="hover:bg-connect-surface hover:text-connect-ink flex h-11 w-11 items-center justify-center rounded-md transition"
                  aria-label="グループDMを開く"
                  title="グループDMを開く"
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                </button>
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
                  onClick={() =>
                    setProfileDialogTarget({ userId: selectedFriend.userId })
                  }
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
            <button
              type="button"
              onClick={() => setIsProfileSettingsOpen(true)}
              className="text-connect-muted hover:bg-connect-surface hover:text-connect-ink flex h-11 w-11 items-center justify-center rounded-md transition"
              aria-label="設定"
            >
              <Settings className="h-5 w-5" aria-hidden="true" />
            </button>
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

                        return (
                          <MessageRow
                            key={chatMessage.id}
                            author={author}
                            canReact={canReactToSelectedServerMessages}
                            editingContent={
                              isEditing ? editingMessage.content : null
                            }
                            firstUnread={
                              chatMessage.id === firstServerUnreadMessageId
                            }
                            isFollowup={
                              !chatMessage.pinnedAt &&
                              chatMessage.id !== firstServerUnreadMessageId &&
                              shouldGroupMessage(
                                chatMessage,
                                serverMessages[messageIndex - 1],
                              )
                            }
                            isMenuOpen={
                              messageContextMenu?.kind === "server" &&
                              messageContextMenu.messageId === chatMessage.id
                            }
                            isUpdating={
                              isEditing && updateServerMessage.isPending
                            }
                            message={chatMessage}
                            onCancelEdit={() => setEditingMessage(null)}
                            onContextMenu={(event) =>
                              openServerMessageMenu(event, chatMessage)
                            }
                            onEditChange={(content) =>
                              setEditingMessage((current) =>
                                current?.kind === "server" &&
                                current.messageId === chatMessage.id
                                  ? { ...current, content }
                                  : current,
                              )
                            }
                            onEditSubmit={handleMessageEditSubmit}
                            onOpenLink={setPendingExternalLink}
                            onOpenProfile={() =>
                              setProfileDialogTarget({
                                serverId: selectedServer.server.id,
                                userId: author.userId,
                              })
                            }
                            onProfileContextMenu={(event) =>
                              openProfileContextMenu(event, author)
                            }
                            onReact={(emoji) =>
                              selectedServerId &&
                              toggleServerReaction.mutate({
                                emoji,
                                messageId: chatMessage.id,
                                serverId: selectedServerId,
                              })
                            }
                            separatorRef={messageViewport.unreadRef}
                            serverId={selectedServer.server.id}
                          />
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
                            onOpenProfile={() =>
                              setProfileDialogTarget({
                                serverId: selectedServer.server.id,
                                userId:
                                  serverConversationData.currentUser.userId,
                              })
                            }
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
                            onClick={() =>
                              setProfileDialogTarget({
                                userId: directConversation.friend.userId,
                              })
                            }
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
                          const author =
                            chatMessage.senderId ===
                            directConversation.currentUserId
                              ? directConversation.currentUser
                              : directConversation.friend;
                          const isEditing =
                            editingMessage?.kind === "direct" &&
                            editingMessage.messageId === chatMessage.id;

                          return (
                            <MessageRow
                              key={chatMessage.id}
                              author={author}
                              canReact
                              editingContent={
                                isEditing ? editingMessage.content : null
                              }
                              firstUnread={
                                chatMessage.id === firstDirectUnreadMessageId
                              }
                              isFollowup={shouldGroupMessage(
                                chatMessage,
                                chatMessage.id === firstDirectUnreadMessageId
                                  ? undefined
                                  : directMessages[messageIndex - 1],
                              )}
                              isMenuOpen={
                                messageContextMenu?.kind === "direct" &&
                                messageContextMenu.messageId === chatMessage.id
                              }
                              isUpdating={
                                isEditing && updateDirectMessage.isPending
                              }
                              message={chatMessage}
                              onCancelEdit={() => setEditingMessage(null)}
                              onContextMenu={(event) =>
                                openDirectMessageMenu(event, chatMessage)
                              }
                              onEditChange={(content) =>
                                setEditingMessage((current) =>
                                  current?.kind === "direct" &&
                                  current.messageId === chatMessage.id
                                    ? { ...current, content }
                                    : current,
                                )
                              }
                              onEditSubmit={handleMessageEditSubmit}
                              onOpenLink={setPendingExternalLink}
                              onOpenProfile={() =>
                                setProfileDialogTarget({
                                  userId: author.userId,
                                })
                              }
                              onProfileContextMenu={(event) =>
                                openProfileContextMenu(event, author)
                              }
                              onReact={(emoji) =>
                                toggleDirectReaction.mutate({
                                  emoji,
                                  messageId: chatMessage.id,
                                })
                              }
                              separatorRef={messageViewport.unreadRef}
                            />
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
                              onOpenProfile={() =>
                                setProfileDialogTarget({
                                  userId: directConversation.currentUser.userId,
                                })
                              }
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
                  <ChatComposer
                    key={`server:${selectedServerId}:${selectedServerChannel?.id ?? ""}`}
                    ref={serverComposerRef}
                    disabled={
                      !selectedServerChannel?.id ||
                      !canSendSelectedServerMessages
                    }
                    joinedToReply={
                      replyTarget?.kind === "server" &&
                      canSendSelectedServerMessages
                    }
                    onError={setServerMessage}
                    onSubmit={handleServerSubmit}
                    placeholder={
                      canSendSelectedServerMessages
                        ? `#${selectedServerChannel?.name ?? "general"} へメッセージを送信`
                        : "閲覧のみのためメッセージを送信できません"
                    }
                    storageKey={
                      selectedServerChannel?.id
                        ? `connect:draft:server:${selectedServerChannel.id}`
                        : null
                    }
                  />
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
                          className="border-connect-ink/15 bg-connect-surface text-connect-ink focus:border-connect-action focus:ring-connect-focus-soft min-h-11 flex-1 rounded-md border px-3 focus:ring-2 focus:outline-none disabled:opacity-50"
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
                      <div className="text-connect-neutral mb-2 min-h-5 px-1 text-sm">
                        {typingUserName
                          ? `${typingUserName} が入力中...`
                          : canSendDirectMessage
                            ? null
                            : "フレンドではないため、新しいメッセージは送信できません"}
                      </div>
                      <ChatComposer
                        key={`direct:${selectedFriendId ?? ""}`}
                        ref={directComposerRef}
                        disabled={!selectedFriendId || !canSendDirectMessage}
                        joinedToReply={replyTarget?.kind === "direct"}
                        onError={setMessage}
                        onSubmit={handleDirectSubmit}
                        onTypingChange={broadcastTyping}
                        placeholder={
                          !canSendDirectMessage
                            ? "この会話には送信できません"
                            : selectedFriend
                              ? `${getDisplayName(selectedFriend)} へメッセージを送信`
                              : "フレンドを選択してください"
                        }
                        storageKey={
                          selectedFriendId
                            ? `connect:draft:direct:${selectedFriendId}`
                            : null
                        }
                      />
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
              onOpenProfile={(userId) =>
                setProfileDialogTarget({
                  serverId: selectedServer.server.id,
                  userId,
                })
              }
              onProfileContextMenu={openProfileContextMenu}
              onRemove={handleRemoveServerMember}
              onUpdateRole={handleUpdateServerMemberRole}
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
                className="border-connect-ink/15 bg-connect-surface text-connect-ink focus:border-connect-action focus:ring-connect-focus-soft min-h-11 w-full rounded-md border px-3 focus:ring-2 focus:outline-none"
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
                    className="border-connect-ink/15 bg-connect-surface text-connect-muted focus:border-connect-action focus:ring-connect-focus-soft min-h-11 min-w-0 flex-1 rounded-md border px-3 text-sm focus:ring-2 focus:outline-none"
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
                className="border-connect-ink/15 bg-connect-surface focus:border-connect-action focus:ring-connect-focus-soft min-h-11 w-full rounded-md border px-3 focus:ring-2 focus:outline-none"
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
                className="border-connect-ink/15 bg-connect-surface focus:border-connect-action focus:ring-connect-focus-soft min-h-28 w-full resize-y rounded-md border px-3 py-2 focus:ring-2 focus:outline-none"
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

      {isGroupDmOpen && (
        <GroupDmDialog
          isRealtimeConnected={isRealtimeConnected}
          initialGroupId={selectedGroupId}
          open
          onOpenChange={setIsGroupDmOpen}
        />
      )}

      {isProfileSettingsOpen && (
        <ProfileSettingsDialog open onOpenChange={setIsProfileSettingsOpen} />
      )}

      {profileDialogTarget && (
        <UserProfileDialog
          open
          onOpenChange={(open) => !open && setProfileDialogTarget(null)}
          serverId={profileDialogTarget.serverId}
          userId={profileDialogTarget.userId}
        />
      )}

      {isPinnedMessagesOpen && (
        <PinnedMessagesDialog
          channelId={selectedServerChannel?.id}
          onOpenChange={setIsPinnedMessagesOpen}
          onOpenLink={setPendingExternalLink}
          onProfileContextMenu={openProfileContextMenu}
          open
          serverId={selectedServer?.server.id}
        />
      )}

      {pendingExternalLink && (
        <ExternalLinkDialog
          onClose={() => setPendingExternalLink(null)}
          url={pendingExternalLink}
        />
      )}

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
