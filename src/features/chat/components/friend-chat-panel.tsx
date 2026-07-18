"use client";

import {
  Check,
  ChevronDown,
  Copy,
  Ellipsis,
  Hash,
  Inbox,
  LogOut,
  Menu,
  MessageCircle,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  ShieldOff,
  Shuffle,
  Trash2,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type FormEvent, type MouseEvent } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ChatQueryError } from "~/features/chat/components/chat-query-error";
import { matchesFriendSearch } from "~/features/chat/friend-search";
import { shouldGroupMessage } from "~/features/chat/message-grouping";
import { splitMessageLinks } from "~/features/chat/message-links";
import { FriendPanel } from "~/features/friend/components/friend-panel";
import {
  getPresenceDisplayLabel,
  getPresenceDotClassName,
} from "~/features/profile/presence";
import { PresenceStatusMenu } from "~/features/profile/components/presence-status-menu";
import { ProfileSettingsDialog } from "~/features/profile/components/profile-settings-dialog";
import { UserProfileDialog } from "~/features/profile/components/user-profile-dialog";
import { ServerRail } from "~/features/server/components/server-rail";
import { getRealtimeUnreadCount } from "~/features/server/server/server-overview";
import { type RouterOutputs, api } from "~/trpc/react";

type ChatFriend = RouterOutputs["chat"]["getFriends"][number];
type ChatServerMembership =
  RouterOutputs["server"]["getOverview"]["memberships"][number];
type ChatEventPayload =
  | { kind: "direct"; userIds: string[] }
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
  initialServerId?: string;
};
type EditingMessage =
  | { content: string; kind: "direct"; messageId: string }
  | { content: string; kind: "server"; messageId: string };
type MessageContextMenu =
  | { kind: "direct"; messageId: string; x: number; y: number }
  | { kind: "server"; messageId: string; x: number; y: number };
const matchingTopics = [
  { label: "雑談", value: "CASUAL" },
  { label: "ゲーム", value: "GAME" },
  { label: "悩み事", value: "WORRIES" },
] as const;
type MatchingTopic = (typeof matchingTopics)[number]["value"];

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "処理に失敗しました";
}

function getDisplayName(user: { name?: string | null; userId: string }) {
  const name = user.name?.trim();

  if (name === undefined || name.length === 0) {
    return user.userId;
  }

  return name;
}

function MessageText({
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

function getServerDisplayName(member: {
  nickname?: string | null;
  user: { name?: string | null; userId: string };
}) {
  const nickname = member.nickname?.trim();

  return nickname ?? getDisplayName(member.user);
}

function getInitial(user: { name?: string | null; userId: string }) {
  return getDisplayName(user).slice(0, 1).toUpperCase();
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function Avatar({
  className,
  user,
}: {
  className: string;
  user: { image?: string | null; name?: string | null; userId: string };
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
      {getInitial(user)}
    </span>
  );
}

function ProfileAvatar({
  className,
  serverId,
  user,
}: {
  className: string;
  serverId?: string;
  user: { image?: string | null; name?: string | null; userId: string };
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

function FriendListItem({
  item,
  onSelect,
  selected,
}: {
  item: ChatFriend;
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
          ? "bg-[#18221f] text-[#f6f0e4]"
          : "text-[#53615a] hover:bg-[#fff8ed] hover:text-[#18221f]"
      }`}
    >
      <div className="relative shrink-0">
        <Avatar
          user={item.friend}
          className="h-10 w-10 rounded-full border border-black/10"
        />
        {item.unreadCount > 0 && (
          <span className="absolute -right-1 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#f1e4d0] bg-[#9f4122] px-1 text-[11px] font-semibold text-white">
            {item.unreadCount}
          </span>
        )}
      </div>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {getDisplayName(item.friend)}
        </span>
        <span className="block truncate text-xs text-[#53615a]">{preview}</span>
      </span>
    </button>
  );
}

export function FriendChatPanel({ initialServerId }: FriendChatPanelProps) {
  const utils = api.useUtils();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(
    initialServerId ?? null,
  );
  const [selectedServerChannelId, setSelectedServerChannelId] = useState<
    string | null
  >(null);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [isNavigationOpen, setIsNavigationOpen] = useState(!initialServerId);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const [friendSearch, setFriendSearch] = useState("");
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [isMatchingOpen, setIsMatchingOpen] = useState(false);
  const [matchingTopic, setMatchingTopic] = useState<MatchingTopic>("CASUAL");
  const [matchingState, setMatchingState] = useState<"idle" | "waiting">(
    "idle",
  );
  const [matchingMessage, setMatchingMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [serverDraft, setServerDraft] = useState("");
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
  const [editingMessage, setEditingMessage] = useState<EditingMessage | null>(
    null,
  );
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);
  const [isPinnedMessagesOpen, setIsPinnedMessagesOpen] = useState(false);
  const [isMemberListOpen, setIsMemberListOpen] = useState(false);
  const [pendingExternalLink, setPendingExternalLink] = useState<string | null>(
    null,
  );
  const [serverNameDraft, setServerNameDraft] = useState("");
  const [serverIconFile, setServerIconFile] = useState<File | null>(null);
  const [serverSettingsMessage, setServerSettingsMessage] = useState<
    string | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [typingUserName, setTypingUserName] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const serverMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const localTypingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastTypingSentAtRef = useRef(0);

  const friends = api.chat.getFriends.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.status === "error"
        ? false
        : matchingState === "waiting" || !isRealtimeConnected
          ? 5000
          : 30000,
  });
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
  const selectedServerMembers = useMemo(() => {
    if (!selectedServer) return [];

    return [...selectedServer.server.members].sort((memberA, memberB) =>
      getServerDisplayName(memberA).localeCompare(
        getServerDisplayName(memberB),
        "ja",
      ),
    );
  }, [selectedServer]);
  const isSelectedServerOwner = selectedServer?.role === "OWNER";
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
  const latestDirectMessageId = directMessages.at(-1)?.id;
  const latestServerMessageId = serverMessages.at(-1)?.id;
  const isConversationVisible = isDesktopLayout || !isNavigationOpen;

  const { mutate: markDirectConversationRead } =
    api.chat.markConversationRead.useMutation({
      onSuccess: () => void utils.chat.getFriends.invalidate(),
    });
  const { mutate: markServerChannelRead } =
    api.server.markChannelRead.useMutation({
      onSuccess: (_result, variables) => {
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
      },
    });

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    const updateLayout = () => setIsDesktopLayout(desktopQuery.matches);

    updateLayout();
    desktopQuery.addEventListener("change", updateLayout);
    return () => desktopQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [latestDirectMessageId, selectedFriendId]);

  useEffect(() => {
    serverMessagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [latestServerMessageId, selectedServerChannel?.id, selectedServerId]);

  useEffect(() => {
    if (!isConversationVisible || !selectedFriendId || !latestDirectMessageId) {
      return;
    }

    markDirectConversationRead({
      friendId: selectedFriendId,
      messageId: latestDirectMessageId,
    });
  }, [
    isConversationVisible,
    latestDirectMessageId,
    markDirectConversationRead,
    selectedFriendId,
  ]);

  useEffect(() => {
    if (
      !isConversationVisible ||
      !selectedServerId ||
      !selectedServerChannel?.id ||
      !latestServerMessageId
    ) {
      return;
    }

    markServerChannelRead({
      channelId: selectedServerChannel.id,
      messageId: latestServerMessageId,
      serverId: selectedServerId,
    });
  }, [
    isConversationVisible,
    latestServerMessageId,
    markServerChannelRead,
    selectedServerChannel?.id,
    selectedServerId,
  ]);

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
    if (!messageContextMenu) return;

    const closeMenu = () => setMessageContextMenu(null);
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
  }, [messageContextMenu]);

  useEffect(() => {
    setMessageContextMenu(null);
    setEditingMessage(null);
    setIsPinnedMessagesOpen(false);
    setIsMemberListOpen(false);
  }, [selectedFriendId, selectedServerChannel?.id, selectedServerId]);

  const selectedFriendContact = useMemo(
    () =>
      friends.data?.find((item) => item.friend.id === selectedFriendId) ?? null,
    [friends.data, selectedFriendId],
  );
  const selectedFriend = useMemo(() => {
    return directConversation?.friend ?? selectedFriendContact?.friend ?? null;
  }, [directConversation?.friend, selectedFriendContact?.friend]);
  const canSendDirectMessage =
    directConversation?.canSend ??
    Boolean(
      selectedFriendContact?.isFriend && !selectedFriendContact.isBlocked,
    );
  const { mutate: publishTyping } = api.chat.setTyping.useMutation();

  useEffect(() => {
    const events = new EventSource("/api/chat/events");
    events.onopen = () => setIsRealtimeConnected(true);
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

      if (payload.senderId !== selectedFriendId) return;
      if (typingResetTimerRef.current) {
        clearTimeout(typingResetTimerRef.current);
      }

      if (payload.isTyping) {
        setTypingUserName(payload.userName);
        typingResetTimerRef.current = setTimeout(() => {
          setTypingUserName(null);
        }, 2500);
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
    utils.server.getConversation,
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

  const handleDraftChange = (value: string) => {
    setDraft(value);

    if (!value.trim()) {
      if (localTypingStopTimerRef.current) {
        clearTimeout(localTypingStopTimerRef.current);
      }
      lastTypingSentAtRef.current = 0;
      broadcastTyping(false);
      return;
    }

    const now = Date.now();
    if (now - lastTypingSentAtRef.current > 1000) {
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

  const cancelMatching = api.chat.cancelMatching.useMutation({
    onSuccess: async () => {
      await utils.chat.getMatchingStatus.invalidate();
    },
    onError: (error) => setMatchingMessage(getErrorMessage(error)),
  });

  const matchRandom = api.chat.matchRandom.useMutation({
    onSuccess: async (result) => {
      if (result.status === "matched") {
        openDirectFriend(result.friend.id);
        setMatchingState("idle");
        setMatchingMessage(
          `${getDisplayName(result.friend)}さんとマッチしました`,
        );
        await Promise.all([
          utils.chat.getFriends.invalidate(),
          utils.chat.getConversation.invalidate({ friendId: result.friend.id }),
        ]);
        return;
      }

      setMatchingState("waiting");
      setMatchingMessage("同じ話題の相手を探しています...");
      await utils.chat.getMatchingStatus.invalidate();
    },
    onError: (error) => setMatchingMessage(getErrorMessage(error)),
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

    const friend = status.friend;
    openDirectFriend(friend.id);
    setMatchingState("idle");
    setMatchingMessage(`${getDisplayName(friend)}さんとマッチしました`);
    void Promise.all([
      utils.chat.getFriends.invalidate(),
      utils.chat.getConversation.invalidate({ friendId: friend.id }),
    ]);
    cancelMatching.mutate();
  }, [
    cancelMatching,
    matchingState,
    matchingStatus.data,
    openDirectFriend,
    utils.chat.getConversation,
    utils.chat.getFriends,
  ]);

  const sendMessage = api.chat.sendMessage.useMutation({
    onSuccess: async () => {
      setDraft("");
      setMessage(null);
      lastTypingSentAtRef.current = 0;
      if (localTypingStopTimerRef.current) {
        clearTimeout(localTypingStopTimerRef.current);
      }
      broadcastTyping(false);
      await Promise.all([
        utils.chat.getConversation.invalidate({
          friendId: selectedFriendId ?? "",
        }),
        utils.chat.getFriends.invalidate(),
      ]);
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const sendServerMessage = api.server.sendMessage.useMutation({
    onSuccess: async () => {
      setServerDraft("");
      setServerMessage(null);
      await utils.server.getConversation.invalidate({
        channelId: selectedServerChannel?.id,
        serverId: selectedServerId ?? "",
      });
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

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
      await utils.server.getOverview.invalidate();
    },
    onError: (error) => setServerMessage(getErrorMessage(error)),
  });

  const removeServerMember = api.server.removeMember.useMutation({
    onSuccess: async () => {
      setServerMessage(null);
      await utils.server.getOverview.invalidate();
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
    if (!isSelectedServerOwner) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedServerChannelId(channel.id);
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
    cancelMatching.mutate();
  };

  const openServerSettings = () => {
    if (!selectedServer) return;

    setServerNameDraft(selectedServer.server.name);
    setServerIconFile(null);
    setServerSettingsMessage(null);
    setIsServerMenuOpen(false);
    setIsServerSettingsOpen(true);
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
    if (!selectedServer?.server.id || !serverNameDraft.trim()) return;

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

      updateServer.mutate({
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
    if (!selectedFriendId || !canSendDirectMessage || !draft.trim()) return;
    broadcastTyping(false);

    sendMessage.mutate({
      friendId: selectedFriendId,
      content: draft,
    });
  };

  const handleServerSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !selectedServerId ||
      !selectedServerChannel?.id ||
      !serverDraft.trim()
    ) {
      return;
    }

    sendServerMessage.mutate({
      channelId: selectedServerChannel.id,
      content: serverDraft,
      serverId: selectedServerId,
    });
  };

  const handleCreateChannel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedServer?.server.id || !newChannelName.trim()) return;

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
    if (!selectedServer?.server.id || !editingChannelName.trim()) return;

    updateChannel.mutate({
      channelId,
      name: editingChannelName,
      serverId: selectedServer.server.id,
    });
  };

  const handleDeleteChannel = (channelId: string) => {
    if (!selectedServer?.server.id) return;
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
    role: "MEMBER" | "OWNER",
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

  const openDirectMessageMenu = (
    event: MouseEvent<HTMLElement>,
    chatMessage: { id: string; senderId: string },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setChannelContextMenu(null);
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

    if (!selectedServer?.server.id) return;
    updateServerMessage.mutate({
      content: editingMessage.content,
      messageId: editingMessage.messageId,
      serverId: selectedServer.server.id,
    });
  };

  const handleToggleServerMessagePin = (messageId: string) => {
    if (!selectedServer?.server.id) return;

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
    if (!selectedServer?.server.id) return;
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
  const canEditContextMessage = [
    isDirectContextMessageMine,
    isServerContextMessageMine,
  ].some(Boolean);
  const canDeleteContextMessage = [
    isDirectContextMessageMine,
    isServerContextMessageMine,
    Boolean(serverMessageContextTarget && isSelectedServerOwner),
  ].some(Boolean);
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
    <main className="flex h-dvh min-h-dvh overflow-hidden bg-[#f6f0e4] text-[#18221f]">
      <ServerRail
        memberships={serverOverview.data?.memberships}
        onSelectHome={selectHome}
        onSelectServer={selectServer}
        selectedServerId={selectedServerId}
      />
      <aside
        className={`${
          isNavigationOpen ? "flex" : "hidden"
        } w-[calc(100vw-4rem)] shrink-0 flex-col border-r border-[#18221f]/15 bg-[#f1e4d0] md:flex md:w-[300px] md:max-w-[300px]`}
      >
        {selectedServer ? (
          <>
            <div className="relative border-b border-[#18221f]/15 px-3 py-3 shadow-sm">
              <button
                type="button"
                onClick={() => setIsServerMenuOpen((isOpen) => !isOpen)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md px-2 text-left transition hover:bg-[#fff8ed]"
                aria-expanded={isServerMenuOpen}
              >
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold">
                    {selectedServer.server.name}
                  </span>
                  <span className="mt-1 block text-xs text-[#53615a]">
                    {selectedServer.server.members.length} メンバー
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[#53615a] transition ${
                    isServerMenuOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
              {isServerMenuOpen && (
                <div className="absolute top-[calc(100%-0.5rem)] right-3 left-3 z-40 rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-1 text-sm shadow-xl">
                  {isSelectedServerOwner && (
                    <button
                      type="button"
                      onClick={openServerSettings}
                      className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left font-medium transition hover:bg-[#e4f2dc]"
                    >
                      <Settings className="h-4 w-4" aria-hidden="true" />
                      サーバー設定
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsServerMenuOpen(false);
                      handleLeaveServer();
                    }}
                    disabled={isSelectedServerOwner || leaveServer.isPending}
                    className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left font-medium text-[#9f4122] transition hover:bg-[#fff1e8] disabled:opacity-50"
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
                <p className="text-xs font-semibold tracking-wide text-[#53615a] uppercase">
                  テキストチャンネル
                </p>
                {isSelectedServerOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewChannelFormOpen((isOpen) => !isOpen);
                      setEditingChannelId(null);
                      setEditingChannelName("");
                      setChannelContextMenu(null);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#fff8ed] hover:text-[#18221f]"
                    aria-label="チャンネル追加フォームを開く"
                    title="チャンネルを追加"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              {isSelectedServerOwner && isNewChannelFormOpen && (
                <form
                  onSubmit={handleCreateChannel}
                  className="mb-3 flex gap-2"
                >
                  <input
                    value={newChannelName}
                    onChange={(event) => setNewChannelName(event.target.value)}
                    className="min-h-9 min-w-0 flex-1 rounded-md border border-[#18221f]/15 bg-[#fff8ed] px-2 text-sm text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
                    placeholder="new-channel"
                    maxLength={32}
                    aria-label="チャンネル名"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!newChannelName.trim() || createChannel.isPending}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:cursor-not-allowed disabled:opacity-45"
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
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#fff8ed] hover:text-[#18221f]"
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
                        className="flex min-h-10 items-center gap-1 rounded-md bg-[#fff8ed] px-2"
                      >
                        <Hash
                          className="h-4 w-4 shrink-0 text-[#53615a]"
                          aria-hidden="true"
                        />
                        <input
                          value={editingChannelName}
                          onChange={(event) =>
                            setEditingChannelName(event.target.value)
                          }
                          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#18221f] focus:outline-none"
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
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#114744] text-white transition hover:bg-[#0d3936] disabled:cursor-not-allowed disabled:opacity-45"
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
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#f1e4d0]"
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
                          ? "bg-[#18221f] text-[#f6f0e4]"
                          : "text-[#53615a] hover:bg-[#fff8ed] hover:text-[#18221f]"
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
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#9f4122] px-1 text-[11px] font-semibold text-white">
                            {channel.unreadCount}
                          </span>
                        )}
                      </button>
                      {isSelectedServerOwner && (
                        <button
                          type="button"
                          onClick={(event) => openChannelMenu(event, channel)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
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

            <div className="mt-auto border-t border-[#18221f]/15 px-4 py-3">
              {currentServerUser && (
                <PresenceStatusMenu
                  currentStatus={currentServerUser.presenceStatus}
                >
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-center gap-3 rounded-md px-1 py-1 text-left transition hover:bg-[#fff8ed] focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:outline-none"
                    aria-label={`オンライン状態を変更。現在は${getPresenceDisplayLabel(
                      currentServerUser.presenceStatus,
                    )}`}
                  >
                    <span className="relative shrink-0">
                      <Avatar
                        user={currentServerUser}
                        className="h-10 w-10 rounded-full border border-black/10"
                      />
                      <span
                        className={`absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#f1e4d0] ${getPresenceDotClassName(
                          currentServerUser.presenceStatus,
                        )}`}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {selectedServer.nickname?.trim() ??
                          getDisplayName(currentServerUser)}
                      </span>
                      <span className="block truncate text-xs text-[#53615a]">
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
            <div className="border-b border-[#18221f]/15 px-3 py-3 shadow-sm">
              <label className="flex h-11 items-center gap-2 rounded-md border border-[#18221f]/10 bg-[#fff8ed] px-3 text-sm text-[#68716b]">
                <Search className="h-4 w-4" aria-hidden="true" />
                <input
                  value={friendSearch}
                  onChange={(event) => setFriendSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[#18221f] placeholder:text-[#9aa49e] focus:outline-none"
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
                    ? "bg-[#18221f] text-[#f6f0e4]"
                    : "text-[#53615a] hover:bg-[#fff8ed] hover:text-[#18221f]"
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
                    ? "bg-[#18221f] text-[#f6f0e4]"
                    : "text-[#53615a] hover:bg-[#fff8ed] hover:text-[#18221f]"
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
                    ? "bg-[#18221f] text-[#f6f0e4]"
                    : "text-[#53615a] hover:bg-[#fff8ed] hover:text-[#18221f]"
                }`}
              >
                <Shuffle className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-medium">マッチング</span>
              </button>
            </div>

            <div className="flex items-center justify-between px-4 pt-3 pb-2 text-xs font-semibold tracking-wide text-[#53615a] uppercase">
              <span>DM</span>
              <button
                type="button"
                onClick={openFriends}
                className="flex h-11 w-11 items-center justify-center rounded-md transition hover:bg-[#fff8ed] hover:text-[#18221f]"
                aria-label="フレンドを追加・管理"
                title="フレンドを追加・管理"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
              {friends.isLoading && (
                <div className="space-y-2 px-2">
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="h-12 animate-pulse rounded-md bg-[#fff8ed]"
                    />
                  ))}
                </div>
              )}

              {filteredFriends.map((item) => (
                <FriendListItem
                  key={item.friend.id}
                  item={item}
                  onSelect={() => selectFriend(item.friend.id)}
                  selected={item.friend.id === selectedFriendId}
                />
              ))}

              {friends.data?.length === 0 && (
                <div className="mx-2 rounded-md border border-[#18221f]/10 bg-[#fff8ed] p-4 text-sm leading-6 text-[#53615a]">
                  <Inbox className="mb-3 h-5 w-5 text-[#cc5f2f]" />
                  <p>フレンドを追加すると、ここからDMを始められます。</p>
                  <button
                    type="button"
                    onClick={openFriends}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#18221f] px-3 font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37]"
                  >
                    <Users className="h-4 w-4" aria-hidden="true" />
                    フレンドを追加
                  </button>
                </div>
              )}

              {friends.data &&
                friends.data.length > 0 &&
                filteredFriends.length === 0 && (
                  <p className="px-2 py-3 text-sm text-[#53615a]">
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
        } min-w-0 flex-1 flex-col bg-[#fff8ed]`}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#18221f]/15 bg-[#e4f2dc] px-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsNavigationOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#fff8ed] hover:text-[#18221f] md:hidden"
              aria-label="ナビゲーションを開く"
              title="ナビゲーションを開く"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            {selectedServer ? (
              <Hash
                className="h-5 w-5 shrink-0 text-[#68716b]"
                aria-hidden="true"
              />
            ) : isFriendsOpen ? (
              <Users
                className="h-5 w-5 shrink-0 text-[#68716b]"
                aria-hidden="true"
              />
            ) : isMatchingOpen ? (
              <Shuffle
                className="h-5 w-5 shrink-0 text-[#68716b]"
                aria-hidden="true"
              />
            ) : (
              <MessageCircle
                className="h-5 w-5 shrink-0 text-[#68716b]"
                aria-hidden="true"
              />
            )}
            {selectedServer ? (
              <div className="min-w-0">
                <h1 className="truncate font-semibold">
                  {selectedServerChannel?.name ?? "チャンネル"}
                </h1>
                <p className="truncate text-xs text-[#68716b]">
                  {selectedServer.server.name}
                </p>
              </div>
            ) : selectedFriend ? (
              <>
                <ProfileAvatar user={selectedFriend} className="h-8 w-8" />
                <div className="min-w-0">
                  <h1 className="truncate font-semibold">
                    {getDisplayName(selectedFriend)}
                  </h1>
                  <p className="truncate font-mono text-xs text-[#68716b]">
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
                  className="flex h-11 w-11 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#fff8ed] hover:text-[#18221f]"
                  aria-label="ピン留めしたメッセージ"
                  title="ピン留めしたメッセージ"
                >
                  <Pin className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMemberListOpen(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#fff8ed] hover:text-[#18221f] lg:hidden"
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
                className="flex h-11 w-11 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#fff8ed] hover:text-[#18221f]"
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
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
              {selectedServer ? (
                <>
                  {serverConversation.isLoading && (
                    <div className="space-y-4">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="flex gap-3">
                          <div className="h-10 w-10 animate-pulse rounded-full bg-[#f1e4d0]" />
                          <div className="space-y-2">
                            <div className="h-4 w-36 animate-pulse rounded bg-[#f1e4d0]" />
                            <div className="h-10 w-80 max-w-[70vw] animate-pulse rounded bg-[#f1e4d0]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {serverConversationData && serverMessages.length === 0 && (
                    <div className="flex min-h-full items-end pb-8">
                      <div>
                        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#18221f] text-2xl font-semibold text-[#f6f0e4]">
                          {selectedServer.server.name.slice(0, 2).toUpperCase()}
                        </div>
                        <h2 className="text-3xl font-semibold">
                          {selectedServer.server.name}へようこそ
                        </h2>
                        <p className="mt-2 max-w-xl leading-7 text-[#53615a]">
                          #{selectedServerChannel?.name ?? "general"}
                          の最初のメッセージを送って、会話を始めましょう。
                        </p>
                      </div>
                    </div>
                  )}

                  {serverConversationData && serverMessages.length > 0 && (
                    <div>
                      {serverConversation.hasNextPage && (
                        <div className="flex justify-center pb-4">
                          <button
                            type="button"
                            onClick={() =>
                              void serverConversation.fetchNextPage()
                            }
                            disabled={serverConversation.isFetchingNextPage}
                            className="min-h-9 rounded-md border border-[#18221f]/15 bg-white px-3 text-sm font-semibold text-[#53615a] transition hover:bg-[#f6f0e4] disabled:opacity-50"
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
                            className={`group relative flex items-start gap-3 rounded-md px-2 hover:bg-[#f6f0e4] ${isFollowup ? "py-0.5" : "py-1.5"}`}
                          >
                            {isFollowup ? (
                              <time
                                dateTime={chatMessage.createdAt.toISOString()}
                                className="mt-1 w-10 shrink-0 text-center text-[10px] text-[#68716b] opacity-0 transition group-hover:opacity-100"
                                aria-label={`${getDisplayName(author)}、${formatTime(chatMessage.createdAt)}`}
                              >
                                {formatTime(chatMessage.createdAt)}
                              </time>
                            ) : (
                              <ProfileAvatar
                                user={author}
                                serverId={selectedServer.server.id}
                                className="mt-1 h-10 w-10"
                              />
                            )}
                            <div className="min-w-0 flex-1 text-left">
                              {!isFollowup && (
                                <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                                  <span className="text-sm font-semibold text-[#18221f]">
                                    {getDisplayName(author)}
                                  </span>
                                  <time className="text-xs text-[#68716b]">
                                    {formatTime(chatMessage.createdAt)}
                                  </time>
                                  {chatMessage.pinnedAt && (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#114744]">
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
                                    className="min-h-24 w-full resize-y rounded-md border border-[#18221f]/15 bg-white px-3 py-2 text-left leading-6 text-[#18221f] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
                                    maxLength={1000}
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setEditingMessage(null)}
                                      className="inline-flex min-h-9 items-center rounded-md border border-[#18221f]/15 px-3 text-sm font-semibold text-[#53615a] transition hover:bg-[#f6f0e4]"
                                    >
                                      キャンセル
                                    </button>
                                    <button
                                      type="submit"
                                      disabled={
                                        !editingMessage.content.trim() ||
                                        updateServerMessage.isPending
                                      }
                                      className="inline-flex min-h-9 items-center rounded-md bg-[#114744] px-3 text-sm font-semibold text-white transition hover:bg-[#0d3936] disabled:opacity-50"
                                    >
                                      保存
                                    </button>
                                  </div>
                                </form>
                              ) : chatMessage.isBlocked ? (
                                <details className="rounded-md border border-[#18221f]/10 bg-[#f1e4d0] px-3 py-2 text-left text-sm text-[#53615a]">
                                  <summary className="cursor-pointer font-medium">
                                    ブロック関係にあるユーザーのメッセージ
                                  </summary>
                                  <p className="mt-2 leading-7 break-words whitespace-pre-wrap text-[#18221f]">
                                    <MessageText
                                      content={chatMessage.content}
                                      onOpenLink={setPendingExternalLink}
                                    />
                                  </p>
                                </details>
                              ) : (
                                <p className="text-left leading-7 break-words whitespace-pre-wrap text-[#18221f]">
                                  <MessageText
                                    content={chatMessage.content}
                                    onOpenLink={setPendingExternalLink}
                                  />
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(event) =>
                                openServerMessageMenu(event, chatMessage)
                              }
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#e4f2dc] focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:outline-none md:pointer-events-none md:absolute md:top-1 md:right-2 md:opacity-0 md:focus-visible:pointer-events-auto md:focus-visible:opacity-100"
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
                      <div ref={serverMessagesEndRef} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  {isFriendsOpen && <FriendPanel />}

                  {isMatchingOpen && (
                    <div className="flex h-full items-center justify-center">
                      <div className="max-w-sm text-center">
                        <Shuffle className="mx-auto mb-4 h-12 w-12 text-[#cc5f2f]" />
                        <h2 className="text-xl font-semibold">マッチング</h2>
                        <p className="mt-2 text-sm leading-6 text-[#53615a]">
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
                          <MessageCircle className="mx-auto mb-4 h-12 w-12 text-[#cc5f2f]" />
                          <h2 className="text-xl font-semibold">
                            DMを選択してください
                          </h2>
                          <p className="mt-2 text-sm leading-6 text-[#53615a]">
                            フレンド一覧から相手を選ぶと、会話を始められます。
                          </p>
                          <button
                            type="button"
                            onClick={openFriends}
                            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37]"
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
                            <div className="h-10 w-10 animate-pulse rounded-full bg-[#f1e4d0]" />
                            <div className="space-y-2">
                              <div className="h-4 w-36 animate-pulse rounded bg-[#f1e4d0]" />
                              <div className="h-10 w-80 max-w-[70vw] animate-pulse rounded bg-[#f1e4d0]" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  {!isFriendsOpen &&
                    directConversation &&
                    directMessages.length === 0 && (
                      <div className="flex min-h-full items-end pb-8">
                        <div>
                          <ProfileAvatar
                            user={directConversation.friend}
                            className="mb-4 h-20 w-20"
                          />
                          <h2 className="text-3xl font-semibold">
                            {getDisplayName(directConversation.friend)}
                          </h2>
                          <p className="mt-2 text-[#53615a]">
                            @{directConversation.friend.userId}{" "}
                            とのDMの始まりです。
                          </p>
                        </div>
                      </div>
                    )}

                  {!isFriendsOpen &&
                    directConversation &&
                    directMessages.length > 0 && (
                      <div>
                        {conversation.hasNextPage && (
                          <div className="flex justify-center pb-4">
                            <button
                              type="button"
                              onClick={() => void conversation.fetchNextPage()}
                              disabled={conversation.isFetchingNextPage}
                              className="min-h-9 rounded-md border border-[#18221f]/15 bg-white px-3 text-sm font-semibold text-[#53615a] transition hover:bg-[#f6f0e4] disabled:opacity-50"
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
                            directMessages[messageIndex - 1],
                          );

                          return (
                            <article
                              key={chatMessage.id}
                              onContextMenu={(event) =>
                                openDirectMessageMenu(event, chatMessage)
                              }
                              className={`group relative flex items-start gap-3 rounded-md px-2 hover:bg-[#f6f0e4] ${isFollowup ? "py-0.5" : "py-1.5"}`}
                            >
                              {isFollowup ? (
                                <time
                                  dateTime={chatMessage.createdAt.toISOString()}
                                  className="mt-1 w-10 shrink-0 text-center text-[10px] text-[#68716b] opacity-0 transition group-hover:opacity-100"
                                  aria-label={`${getDisplayName(author)}、${formatTime(chatMessage.createdAt)}`}
                                >
                                  {formatTime(chatMessage.createdAt)}
                                </time>
                              ) : (
                                <ProfileAvatar
                                  user={author}
                                  className="mt-1 h-10 w-10"
                                />
                              )}
                              <div className="min-w-0 flex-1 text-left">
                                {!isFollowup && (
                                  <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                                    <span className="text-sm font-semibold text-[#18221f]">
                                      {getDisplayName(author)}
                                    </span>
                                    <time className="text-xs text-[#68716b]">
                                      {formatTime(chatMessage.createdAt)}
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
                                      className="min-h-24 w-full resize-y rounded-md border border-[#18221f]/15 bg-white px-3 py-2 text-left leading-6 text-[#18221f] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
                                      maxLength={1000}
                                      autoFocus
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setEditingMessage(null)}
                                        className="inline-flex min-h-9 items-center rounded-md border border-[#18221f]/15 px-3 text-sm font-semibold text-[#53615a] transition hover:bg-[#f6f0e4]"
                                      >
                                        キャンセル
                                      </button>
                                      <button
                                        type="submit"
                                        disabled={
                                          !editingMessage.content.trim() ||
                                          updateDirectMessage.isPending
                                        }
                                        className="inline-flex min-h-9 items-center rounded-md bg-[#114744] px-3 text-sm font-semibold text-white transition hover:bg-[#0d3936] disabled:opacity-50"
                                      >
                                        保存
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <p className="text-left leading-7 break-words whitespace-pre-wrap text-[#18221f]">
                                    <MessageText
                                      content={chatMessage.content}
                                      onOpenLink={setPendingExternalLink}
                                    />
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(event) =>
                                  openDirectMessageMenu(event, chatMessage)
                                }
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#e4f2dc] focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:outline-none md:pointer-events-none md:absolute md:top-1 md:right-2 md:opacity-0 md:focus-visible:pointer-events-auto md:focus-visible:opacity-100"
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
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                </>
              )}
            </div>

            <div className="shrink-0 px-4 pb-5">
              {selectedServer ? (
                <>
                  {serverMessage && (
                    <p className="mb-2 rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] px-3 py-2 text-sm text-[#9f4122]">
                      {serverMessage}
                    </p>
                  )}
                  <form
                    onSubmit={handleServerSubmit}
                    className="flex items-end gap-2 rounded-md border border-[#18221f]/15 bg-[#f6f0e4] px-3 py-1.5"
                  >
                    <textarea
                      data-chat-input
                      value={serverDraft}
                      onChange={(event) => setServerDraft(event.target.value)}
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
                      className="max-h-36 min-h-10 flex-1 resize-none bg-transparent py-2 leading-6 text-[#18221f] outline-none placeholder:text-[#9aa49e] focus:outline-none focus-visible:outline-none"
                      placeholder={`#${selectedServerChannel?.name ?? "general"} へメッセージを送信`}
                      disabled={
                        !selectedServerChannel?.id ||
                        sendServerMessage.isPending
                      }
                      maxLength={1000}
                    />
                    <button
                      type="submit"
                      disabled={
                        !selectedServerChannel?.id ||
                        !serverDraft.trim() ||
                        sendServerMessage.isPending
                      }
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:cursor-not-allowed disabled:opacity-50 md:hidden"
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
                        <p className="mb-2 rounded-md border border-[#18221f]/10 bg-white px-3 py-2 text-sm text-[#53615a]">
                          {matchingMessage}
                        </p>
                      )}
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          handleStartMatching();
                        }}
                        className="flex flex-col gap-3 rounded-lg border border-[#18221f]/15 bg-white px-4 py-3 shadow-[6px_6px_0_#d8efee] sm:flex-row sm:items-center"
                      >
                        <select
                          value={matchingTopic}
                          onChange={(event) =>
                            setMatchingTopic(
                              event.target.value as MatchingTopic,
                            )
                          }
                          disabled={matchingState === "waiting"}
                          className="min-h-11 flex-1 rounded-md border border-[#18221f]/15 bg-[#fff8ed] px-3 text-[#18221f] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none disabled:opacity-50"
                          aria-label="話したいこと"
                        >
                          {matchingTopics.map((topic) => (
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
                              matchingState === "waiting"
                            }
                            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
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
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#f1e4d0] hover:text-[#18221f] disabled:opacity-50"
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
                      {message && (
                        <p className="mb-2 rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] px-3 py-2 text-sm text-[#9f4122]">
                          {message}
                        </p>
                      )}
                      <div className="mb-2 min-h-5 px-1 text-sm text-[#68716b]">
                        {typingUserName
                          ? `${typingUserName} が入力中...`
                          : canSendDirectMessage
                            ? null
                            : "フレンドではないため、新しいメッセージは送信できません"}
                      </div>
                      <form
                        onSubmit={handleSubmit}
                        className="flex items-end gap-2 rounded-md border border-[#18221f]/15 bg-[#f6f0e4] px-3 py-1.5"
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
                          className="max-h-36 min-h-10 flex-1 resize-none bg-transparent py-2 leading-6 text-[#18221f] outline-none placeholder:text-[#9aa49e] focus:outline-none focus-visible:outline-none"
                          placeholder={
                            !canSendDirectMessage
                              ? "この会話には送信できません"
                              : selectedFriend
                                ? `${getDisplayName(selectedFriend)} へメッセージを送信`
                                : "フレンドを選択してください"
                          }
                          disabled={
                            !selectedFriendId ||
                            !canSendDirectMessage ||
                            sendMessage.isPending
                          }
                          maxLength={1000}
                        />
                        <button
                          type="submit"
                          disabled={
                            !selectedFriendId ||
                            !canSendDirectMessage ||
                            !draft.trim() ||
                            sendMessage.isPending
                          }
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:cursor-not-allowed disabled:opacity-50 md:hidden"
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
            <>
              {isMemberListOpen && (
                <button
                  type="button"
                  onClick={() => setIsMemberListOpen(false)}
                  className="fixed inset-0 z-30 bg-black/35 lg:hidden"
                  aria-label="メンバー一覧を閉じる"
                />
              )}
              <aside
                className={`${
                  isMemberListOpen
                    ? "fixed inset-y-0 right-0 z-40 block shadow-xl"
                    : "hidden"
                } w-64 shrink-0 overflow-y-auto border-l border-[#18221f]/15 bg-[#f1e4d0] px-4 py-4 lg:static lg:z-auto lg:block lg:shadow-none`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMemberListOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#fff8ed] hover:text-[#18221f] lg:hidden"
                    aria-label="メンバー一覧を閉じる"
                    title="メンバー一覧を閉じる"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <h2 className="text-xs font-semibold tracking-wide text-[#7b6757] uppercase">
                    メンバー
                  </h2>
                </div>
                <div className="space-y-2">
                  {selectedServerMembers.map((member) => {
                    const isCurrentUser =
                      member.user.id === currentServerUser?.id;

                    return (
                      <div
                        key={member.id}
                        className="group flex items-center gap-2 rounded-md px-3 py-2 text-[#18221f] transition-colors hover:bg-black/5"
                      >
                        <UserProfileDialog
                          userId={member.user.userId}
                          serverId={selectedServer.server.id}
                        >
                          <button
                            type="button"
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left focus-visible:ring-2 focus-visible:ring-[#d8efee] focus-visible:outline-none"
                            aria-label={`${getServerDisplayName(member)}のプロフィールを開く`}
                          >
                            <span className="relative shrink-0">
                              <Avatar
                                user={member.user}
                                className="h-9 w-9 rounded-full border border-black/10"
                              />
                              <span
                                className={`absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#f1e4d0] transition-colors group-hover:border-[#e5d8c3] ${getPresenceDotClassName(
                                  member.user.presenceStatus,
                                )}`}
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">
                                {getServerDisplayName(member)}
                              </span>
                              <span className="block truncate text-xs text-[#68716b]">
                                {getPresenceDisplayLabel(
                                  member.user.presenceStatus,
                                )}{" "}
                                ・
                                {member.role === "OWNER"
                                  ? "所有者"
                                  : "メンバー"}
                              </span>
                            </span>
                          </button>
                        </UserProfileDialog>
                        {isSelectedServerOwner && !isCurrentUser && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateServerMemberRole(
                                  member.id,
                                  member.role === "OWNER" ? "MEMBER" : "OWNER",
                                )
                              }
                              disabled={updateServerMemberRole.isPending}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#e4f2dc] hover:text-[#114744] disabled:opacity-45"
                              aria-label={
                                member.role === "OWNER"
                                  ? "メンバーに戻す"
                                  : "所有権を移譲"
                              }
                              title={
                                member.role === "OWNER"
                                  ? "メンバーに戻す"
                                  : "所有権を移譲"
                              }
                            >
                              {member.role === "OWNER" ? (
                                <ShieldOff
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Shield
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveServerMember(
                                  member.id,
                                  getServerDisplayName(member),
                                )
                              }
                              disabled={removeServerMember.isPending}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-[#9f4122] transition hover:bg-[#fff1e8] disabled:opacity-45"
                              aria-label="退出させる"
                              title="退出させる"
                            >
                              <UserMinus
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </aside>
            </>
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
        <DialogContent className="max-h-[92dvh] overflow-y-auto bg-[#f6f0e4] p-0 text-[#18221f] sm:max-w-lg">
          <DialogHeader className="border-b border-[#18221f]/15 px-5 py-4">
            <DialogTitle>サーバー設定</DialogTitle>
            <DialogDescription className="sr-only">
              サーバー名、アイコン、招待リンクを管理します。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleServerSettingsSubmit} className="space-y-5 p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#18221f] text-lg font-semibold text-[#f6f0e4]">
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
                  className="block w-full text-sm text-[#53615a] file:mr-3 file:min-h-9 file:rounded-md file:border-0 file:bg-[#18221f] file:px-3 file:font-semibold file:text-[#f6f0e4]"
                />
                {serverIconFile && (
                  <span className="mt-1 block truncate text-xs text-[#68716b]">
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
                className="min-h-11 w-full rounded-md border border-[#18221f]/15 bg-white px-3 text-[#18221f] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
                maxLength={50}
                required
              />
            </label>

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
                    className="min-h-11 min-w-0 flex-1 rounded-md border border-[#18221f]/15 bg-white px-3 text-sm text-[#53615a] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
                    aria-label="招待リンク"
                  />
                  <button
                    type="button"
                    onClick={handleCopyServerInvite}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#18221f]/15 bg-white px-4 font-semibold transition hover:bg-[#e4f2dc]"
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
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#18221f]/15 bg-white px-4 font-semibold transition hover:bg-[#e4f2dc] disabled:opacity-50"
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
                    ? "border-sky-200 bg-sky-50 text-sky-900"
                    : "border-[#cc5f2f]/25 bg-[#fff1e8] text-[#9f4122]"
                }`}
              >
                {serverSettingsMessage}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={handleDeleteServer}
                disabled={deleteServer.isPending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] px-4 font-semibold text-[#9f4122] transition hover:bg-[#ffd8c6] disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                サーバー削除
              </button>
              <button
                type="submit"
                disabled={!serverNameDraft.trim() || updateServer.isPending}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#114744] px-4 font-semibold text-white transition hover:bg-[#0d3936] disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPinnedMessagesOpen}
        onOpenChange={setIsPinnedMessagesOpen}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto bg-[#f6f0e4] p-0 text-[#18221f] sm:max-w-xl">
          <DialogHeader className="border-b border-[#18221f]/15 px-5 py-4">
            <DialogTitle>ピン留めしたメッセージ</DialogTitle>
            <DialogDescription className="sr-only">
              このチャンネルでピン留めされているメッセージの一覧です。
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-[#18221f]/10 px-5 py-2">
            {serverConversation.isLoading && (
              <p className="py-6 text-sm text-[#68716b]">読み込み中...</p>
            )}
            {serverConversationData?.pinnedMessages.map((chatMessage) => {
              const author = {
                ...chatMessage.sender,
                name:
                  chatMessage.sender.serverMemberships[0]?.nickname ??
                  chatMessage.sender.name,
              };

              return (
                <article key={chatMessage.id} className="flex gap-3 py-4">
                  <ProfileAvatar
                    user={author}
                    serverId={selectedServer?.server.id}
                    className="h-10 w-10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold">
                        {getDisplayName(author)}
                      </span>
                      <time className="text-xs text-[#68716b]">
                        {formatTime(chatMessage.createdAt)}
                      </time>
                    </div>
                    {chatMessage.isBlocked ? (
                      <details className="rounded-md border border-[#18221f]/10 bg-[#f1e4d0] px-3 py-2 text-sm text-[#53615a]">
                        <summary className="cursor-pointer font-medium">
                          ブロック関係にあるユーザーのメッセージ
                        </summary>
                        <p className="mt-2 leading-7 break-words whitespace-pre-wrap text-[#18221f]">
                          <MessageText
                            content={chatMessage.content}
                            onOpenLink={setPendingExternalLink}
                          />
                        </p>
                      </details>
                    ) : (
                      <p className="leading-7 break-words whitespace-pre-wrap">
                        <MessageText
                          content={chatMessage.content}
                          onOpenLink={setPendingExternalLink}
                        />
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
            {serverConversationData?.pinnedMessages.length === 0 && (
              <p className="py-6 text-sm text-[#68716b]">
                ピン留めされたメッセージはありません
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingExternalLink !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingExternalLink(null);
        }}
      >
        <DialogContent className="bg-[#fff8ed] text-[#18221f] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>外部リンクを開きますか？</DialogTitle>
            <DialogDescription className="text-[#68716b]">
              次のリンクを新しいタブで開きます。
            </DialogDescription>
          </DialogHeader>
          <p className="max-h-32 overflow-y-auto rounded-md bg-[#f6f0e4] px-3 py-2 text-sm break-all text-[#53615a]">
            {pendingExternalLink}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingExternalLink(null)}
              className="inline-flex min-h-10 items-center rounded-md border border-[#18221f]/15 px-4 text-sm font-semibold text-[#53615a] transition hover:bg-[#f6f0e4]"
            >
              キャンセル
            </button>
            {pendingExternalLink && (
              <a
                href={pendingExternalLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPendingExternalLink(null)}
                className="inline-flex min-h-10 items-center rounded-md bg-[#114744] px-4 text-sm font-semibold text-white transition hover:bg-[#0d3936]"
              >
                開く
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {channelContextMenu && channelContextTarget && selectedServer && (
        <div
          className="fixed z-50 w-48 rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-1 text-sm text-[#18221f] shadow-xl"
          style={{ left: channelContextMenu.x, top: channelContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
        >
          <button
            type="button"
            onClick={() => openChannelEditor(channelContextTarget)}
            className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition hover:bg-[#e4f2dc]"
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
            className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left text-[#9f4122] transition hover:bg-[#fff1e8] disabled:cursor-not-allowed disabled:opacity-45"
            role="menuitem"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            削除
          </button>
        </div>
      )}

      {messageContextMenu && messageContextTarget && (
        <div
          className="fixed z-50 w-48 rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-1 text-sm text-[#18221f] shadow-xl"
          style={{ left: messageContextMenu.x, top: messageContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
        >
          <button
            type="button"
            onClick={() => void handleCopyMessage()}
            className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition hover:bg-[#e4f2dc]"
            role="menuitem"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            コピー
          </button>
          {serverMessageContextTarget && isSelectedServerOwner && (
            <button
              type="button"
              onClick={() =>
                handleToggleServerMessagePin(serverMessageContextTarget.id)
              }
              disabled={toggleServerMessagePin.isPending}
              className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition hover:bg-[#e4f2dc] disabled:opacity-45"
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
              className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition hover:bg-[#e4f2dc]"
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
              className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left text-[#9f4122] transition hover:bg-[#fff1e8] disabled:cursor-not-allowed disabled:opacity-45"
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
