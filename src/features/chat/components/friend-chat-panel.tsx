"use client";

import {
  Check,
  Hash,
  Inbox,
  LogOut,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Send,
  Settings,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type FormEvent, type MouseEvent } from "react";
import { type RealtimeChannel } from "@supabase/supabase-js";

import {
  getDirectChatChannelName,
  getSupabaseRealtimeClient,
} from "~/lib/supabase/realtime";
import { type RouterOutputs, api } from "~/trpc/react";

type ChatFriend = RouterOutputs["chat"]["getFriends"][number];
type ChatServerMembership =
  RouterOutputs["server"]["getOverview"]["memberships"][number];
type DirectChatBroadcastPayload = {
  messageId: string;
  receiverId: string;
  senderId: string;
  sentAt: string;
};
type TypingBroadcastPayload = {
  at: number;
  isTyping: boolean;
  userId: string;
  userName: string;
};

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
          <span className="absolute -right-1 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#f1e4d0] bg-[#cc5f2f] px-1 text-[11px] font-semibold text-white">
            {item.unreadCount}
          </span>
        )}
      </div>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {getDisplayName(item.friend)}
        </span>
        <span className="block truncate text-xs text-[#68716b]">{preview}</span>
      </span>
    </button>
  );
}

export function FriendChatPanel() {
  const utils = api.useUtils();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedServerChannelId, setSelectedServerChannelId] = useState<
    string | null
  >(null);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [serverDraft, setServerDraft] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState("");
  const [channelContextMenu, setChannelContextMenu] = useState<{
    channelId: string;
    x: number;
    y: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [typingUserName, setTypingUserName] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const serverMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const typingResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const localTypingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastTypingSentAtRef = useRef(0);
  const realtimeClient = useMemo(() => getSupabaseRealtimeClient(), []);

  const friends = api.chat.getFriends.useQuery(undefined, {
    refetchInterval: realtimeClient ? false : 5000,
  });
  const serverOverview = api.server.getOverview.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const selectedServer = useMemo(() => {
    return (
      serverOverview.data?.memberships.find(
        (membership) => membership.server.id === selectedServerId,
      ) ?? null
    );
  }, [serverOverview.data?.memberships, selectedServerId]);
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
  const isSelectedServerOwner = selectedServer?.role === "OWNER";
  const channelContextTarget = channelContextMenu
    ? selectedServer?.server.channels.find(
        (channel) => channel.id === channelContextMenu.channelId,
      )
    : undefined;
  const serverConversation = api.server.getConversation.useQuery(
    {
      channelId: selectedServerChannel?.id,
      serverId: selectedServerId ?? "",
    },
    {
      enabled: Boolean(selectedServerId && selectedServerChannel?.id),
      refetchInterval:
        selectedServerId && selectedServerChannel?.id ? 3000 : false,
    },
  );

  useEffect(() => {
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
  }, [friends.data, selectedFriendId]);

  const conversation = api.chat.getConversation.useQuery(
    { friendId: selectedFriendId ?? "" },
    {
      enabled: Boolean(selectedFriendId),
      refetchInterval: selectedFriendId && !realtimeClient ? 3000 : false,
    },
  );

  const currentUser = conversation.data?.currentUser ?? null;
  const currentUserId = currentUser?.id;
  const currentUserName = currentUser ? getDisplayName(currentUser) : null;
  const selectedChannelName =
    currentUserId && selectedFriendId
      ? getDirectChatChannelName(currentUserId, selectedFriendId)
      : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [conversation.data?.messages.length, selectedFriendId]);

  useEffect(() => {
    serverMessagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [
    serverConversation.data?.messages.length,
    selectedServerChannel?.id,
    selectedServerId,
  ]);

  useEffect(() => {
    if (!selectedServer) {
      setSelectedServerChannelId(null);
      setEditingChannelId(null);
      setEditingChannelName("");
      setNewChannelName("");
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
    if (conversation.data) {
      void utils.chat.getFriends.invalidate();
    }
  }, [conversation.data, utils.chat.getFriends]);

  useEffect(() => {
    if (!realtimeClient || !friends.data?.length) {
      return;
    }

    const channelNames = [
      ...new Set(
        friends.data
          .map((item) =>
            getDirectChatChannelName(item.currentUserId, item.friend.id),
          )
          .filter((channelName) => channelName !== selectedChannelName),
      ),
    ];

    const channels = channelNames.map((channelName) => {
      const channel = realtimeClient.channel(channelName, {
        config: {
          broadcast: { self: false },
        },
      });

      channel
        .on("broadcast", { event: "direct-message" }, () => {
          void utils.chat.getFriends.invalidate();
        })
        .subscribe();

      return channel;
    });

    return () => {
      channels.forEach((channel) => {
        void realtimeClient.removeChannel(channel);
      });
    };
  }, [
    friends.data,
    realtimeClient,
    selectedChannelName,
    utils.chat.getFriends,
  ]);

  const selectedFriend = useMemo(() => {
    return (
      conversation.data?.friend ??
      friends.data?.find((item) => item.friend.id === selectedFriendId)
        ?.friend ??
      null
    );
  }, [conversation.data?.friend, friends.data, selectedFriendId]);

  useEffect(() => {
    if (
      !realtimeClient ||
      !selectedChannelName ||
      !selectedFriendId ||
      !currentUserId
    ) {
      setTypingUserName(null);
      return;
    }

    const channel = realtimeClient.channel(selectedChannelName, {
      config: {
        broadcast: { self: false },
      },
    });

    realtimeChannelRef.current = channel;

    channel
      .on("broadcast", { event: "direct-message" }, ({ payload }) => {
        const data = payload as DirectChatBroadcastPayload;
        if (data.senderId === currentUserId) return;

        void Promise.all([
          utils.chat.getConversation.invalidate({ friendId: selectedFriendId }),
          utils.chat.getFriends.invalidate(),
        ]);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const data = payload as TypingBroadcastPayload;
        if (data.userId === currentUserId) return;

        if (typingResetTimerRef.current) {
          clearTimeout(typingResetTimerRef.current);
        }

        if (data.isTyping) {
          setTypingUserName(data.userName);
          typingResetTimerRef.current = setTimeout(() => {
            setTypingUserName(null);
          }, 2500);
        } else {
          setTypingUserName(null);
        }
      })
      .subscribe();

    return () => {
      if (typingResetTimerRef.current) {
        clearTimeout(typingResetTimerRef.current);
      }
      setTypingUserName(null);
      realtimeChannelRef.current = null;
      void realtimeClient.removeChannel(channel);
    };
  }, [
    currentUserId,
    realtimeClient,
    selectedChannelName,
    selectedFriendId,
    utils.chat.getConversation,
    utils.chat.getFriends,
  ]);

  const broadcastTyping = useCallback(
    (isTyping: boolean) => {
      if (
        !realtimeChannelRef.current ||
        !currentUserId ||
        !currentUserName ||
        !selectedFriendId
      ) {
        return;
      }

      void realtimeChannelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: {
          at: Date.now(),
          isTyping,
          userId: currentUserId,
          userName: currentUserName,
        } satisfies TypingBroadcastPayload,
      });
    },
    [currentUserId, currentUserName, selectedFriendId],
  );

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

  const sendMessage = api.chat.sendMessage.useMutation({
    onSuccess: async (createdMessage, variables) => {
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
      await realtimeChannelRef.current?.send({
        type: "broadcast",
        event: "direct-message",
        payload: {
          messageId: createdMessage.id,
          receiverId: variables.friendId,
          senderId: createdMessage.senderId,
          sentAt: createdMessage.createdAt.toISOString(),
        } satisfies DirectChatBroadcastPayload,
      });
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

  const selectFriend = (friendId: string) => {
    setSelectedServerId(null);
    setSelectedServerChannelId(null);
    setEditingChannelId(null);
    setEditingChannelName("");
    setNewChannelName("");
    setChannelContextMenu(null);
    setSelectedFriendId(friendId);
    setServerMessage(null);
  };

  const selectServer = (membership: ChatServerMembership) => {
    setSelectedServerId(membership.server.id);
    setSelectedServerChannelId(membership.server.channels[0]?.id ?? null);
    setEditingChannelId(null);
    setEditingChannelName("");
    setNewChannelName("");
    setChannelContextMenu(null);
    setServerMessage(null);
    setMessage(null);
  };

  const openChannelMenu = (
    event: MouseEvent<HTMLDivElement>,
    channel: ChatServerMembership["server"]["channels"][number],
  ) => {
    if (!isSelectedServerOwner) return;

    event.preventDefault();
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFriendId || !draft.trim()) return;
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

    setChannelContextMenu(null);
    deleteChannel.mutate({
      channelId,
      serverId: selectedServer.server.id,
    });
  };

  const serverConversationData = serverConversation.data ?? null;
  const serverMessages = serverConversationData?.messages ?? [];
  const directConversation = conversation.data ?? null;
  const directMessages = directConversation?.messages ?? [];

  return (
    <main className="flex min-h-screen overflow-hidden bg-[#f6f0e4] text-[#18221f]">
      <aside className="flex w-[72px] shrink-0 flex-col items-center gap-3 bg-[#18221f] px-3 py-4">
        <Link
          href="/"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff8ed] transition hover:rounded-xl"
          aria-label="connect"
        >
          <Image
            src="/connect-icon.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-xl object-cover"
            priority
          />
        </Link>
        <div className="h-px w-8 bg-[#f6f0e4]/25" />
        <Link
          href="/friends"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2f3c37] text-[#d8efee] transition hover:rounded-xl hover:bg-[#d8efee] hover:text-[#114744]"
          aria-label="フレンド"
        >
          <Users className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-y-auto">
          {serverOverview.data?.memberships.map((membership) => (
            <button
              key={membership.id}
              type="button"
              onClick={() => selectServer(membership)}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold transition hover:rounded-xl ${
                membership.server.id === selectedServerId
                  ? "bg-[#d8efee] text-[#114744]"
                  : "bg-[#2f3c37] text-[#d8efee] hover:bg-[#d8efee] hover:text-[#114744]"
              }`}
              aria-label={`${membership.server.name}を開く`}
              title={membership.server.name}
            >
              {membership.server.name.slice(0, 2).toUpperCase()}
            </button>
          ))}
          <Link
            href="/servers/new"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#d8efee]/30 bg-[#2f3c37] text-[#d8efee] transition hover:rounded-xl hover:bg-[#d8efee] hover:text-[#114744]"
            aria-label="サーバーを作成"
            title="サーバーを作成"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-auto flex flex-col gap-3">
          <Link
            href="/profile"
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2f3c37] text-[#f6f0e4] transition hover:rounded-xl hover:bg-[#fff8ed] hover:text-[#18221f]"
            aria-label="プロフィール"
          >
            <UserRound className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link
            href="/api/auth/signout"
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2f3c37] text-[#f6f0e4] transition hover:rounded-xl hover:bg-[#fff8ed] hover:text-[#18221f]"
            aria-label="ログアウト"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </aside>

      <aside className="flex w-[300px] shrink-0 flex-col border-r border-[#18221f]/15 bg-[#f1e4d0]">
        {selectedServer ? (
          <>
            <div className="border-b border-[#18221f]/15 px-4 py-4 shadow-sm">
              <h2 className="truncate text-lg font-semibold">
                {selectedServer.server.name}
              </h2>
              <p className="mt-1 text-xs text-[#68716b]">
                {selectedServer.server.members.length} メンバー
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <p className="text-xs font-semibold tracking-wide text-[#68716b] uppercase">
                  テキストチャンネル
                </p>
                {isSelectedServerOwner && (
                  <Plus className="h-4 w-4 text-[#68716b]" aria-hidden="true" />
                )}
              </div>

              {isSelectedServerOwner && (
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
                  />
                  <button
                    type="submit"
                    disabled={!newChannelName.trim() || createChannel.isPending}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="チャンネルを追加"
                    title="チャンネルを追加"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
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
                          className="h-4 w-4 shrink-0 text-[#68716b]"
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
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#114744] transition hover:bg-[#d8efee] disabled:cursor-not-allowed disabled:opacity-45"
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
                          setSelectedServerChannelId(channel.id);
                          setServerMessage(null);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <Hash className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span className="truncate text-sm font-medium">
                          {channel.name}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto border-t border-[#18221f]/15 px-4 py-3">
              <p className="text-xs font-semibold text-[#68716b] uppercase">
                あなたの権限
              </p>
              <p className="mt-1 text-sm font-semibold">
                {selectedServer.role === "OWNER" ? "管理者" : "メンバー"}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-[#18221f]/15 px-3 py-3 shadow-sm">
              <label className="flex h-9 items-center gap-2 rounded-md border border-[#18221f]/10 bg-[#fff8ed] px-3 text-sm text-[#68716b]">
                <Search className="h-4 w-4" aria-hidden="true" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-[#18221f] placeholder:text-[#9aa49e] focus:outline-none"
                  placeholder="会話を探す"
                />
              </label>
            </div>

            <div className="space-y-1 px-2 py-3">
              <Link
                href="/friends"
                className="flex h-10 items-center gap-3 rounded-md px-2 text-[#53615a] transition hover:bg-[#fff8ed] hover:text-[#18221f]"
              >
                <Users className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-medium">フレンド</span>
              </Link>
              <div className="flex h-10 items-center gap-3 rounded-md bg-[#18221f] px-2 text-[#f6f0e4]">
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-medium">
                  ダイレクトメッセージ
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between px-4 pt-3 pb-2 text-xs font-semibold tracking-wide text-[#68716b] uppercase">
              <span>DM</span>
              <Plus className="h-4 w-4" aria-hidden="true" />
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

              {friends.data?.map((item) => (
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
                  フレンドを追加すると、ここからDMを始められます。
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[#fff8ed]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#18221f]/15 bg-[#e4f2dc] px-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <Hash
              className="h-5 w-5 shrink-0 text-[#68716b]"
              aria-hidden="true"
            />
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
                <Avatar
                  user={selectedFriend}
                  className="h-8 w-8 rounded-full border border-black/10"
                />
                <div className="min-w-0">
                  <h1 className="truncate font-semibold">
                    {getDisplayName(selectedFriend)}
                  </h1>
                  <p className="truncate font-mono text-xs text-[#68716b]">
                    @{selectedFriend.userId}
                  </p>
                </div>
              </>
            ) : (
              <h1 className="font-semibold">ダイレクトメッセージ</h1>
            )}
          </div>
          <Link
            href="/profile"
            className="flex h-9 w-9 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#fff8ed] hover:text-[#18221f]"
            aria-label="設定"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </Link>
        </header>

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
                <div className="space-y-1">
                  {serverMessages.map((chatMessage) => {
                    const isMine =
                      chatMessage.senderId ===
                      serverConversationData.currentUser.id;
                    const author = isMine
                      ? { userId: "me", name: "あなた", image: null }
                      : chatMessage.sender;

                    return (
                      <article
                        key={chatMessage.id}
                        className={`group flex gap-3 rounded-md px-2 py-1.5 hover:bg-[#f6f0e4] ${
                          isMine ? "flex-row-reverse" : ""
                        }`}
                      >
                        <Avatar
                          user={author}
                          className="mt-1 h-10 w-10 shrink-0 rounded-full border border-black/10"
                        />
                        <div
                          className={`max-w-[min(760px,82%)] min-w-0 ${
                            isMine ? "text-right" : ""
                          }`}
                        >
                          <div
                            className={`mb-1 flex items-baseline gap-2 ${
                              isMine ? "justify-end" : ""
                            }`}
                          >
                            <span className="text-sm font-semibold text-[#18221f]">
                              {getDisplayName(author)}
                            </span>
                            <time className="text-xs text-[#68716b]">
                              {formatTime(chatMessage.createdAt)}
                            </time>
                          </div>
                          <p
                            className={`rounded-2xl px-4 py-2 text-left leading-7 break-words whitespace-pre-wrap ${
                              isMine
                                ? "rounded-tr-md bg-[#114744] text-[#f6f0e4]"
                                : "rounded-tl-md border border-[#18221f]/10 bg-white text-[#18221f]"
                            }`}
                          >
                            {chatMessage.content}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                  <div ref={serverMessagesEndRef} />
                </div>
              )}
            </>
          ) : (
            <>
              {!selectedFriendId && !friends.isLoading && (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-sm text-center">
                    <MessageCircle className="mx-auto mb-4 h-12 w-12 text-[#cc5f2f]" />
                    <h2 className="text-xl font-semibold">
                      DMを選択してください
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[#53615a]">
                      フレンド一覧から相手を選ぶと、会話を始められます。
                    </p>
                  </div>
                </div>
              )}

              {conversation.isLoading && selectedFriendId && (
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

              {directConversation && directMessages.length === 0 && (
                <div className="flex min-h-full items-end pb-8">
                  <div>
                    <Avatar
                      user={directConversation.friend}
                      className="mb-4 h-20 w-20 rounded-full border border-black/10"
                    />
                    <h2 className="text-3xl font-semibold">
                      {getDisplayName(directConversation.friend)}
                    </h2>
                    <p className="mt-2 text-[#53615a]">
                      @{directConversation.friend.userId} とのDMの始まりです。
                    </p>
                  </div>
                </div>
              )}

              {directConversation && directMessages.length > 0 && (
                <div className="space-y-1">
                  {directMessages.map((chatMessage) => {
                    const isMine =
                      chatMessage.senderId === directConversation.currentUserId;
                    const author = isMine
                      ? { userId: "me", name: "あなた", image: null }
                      : directConversation.friend;

                    return (
                      <article
                        key={chatMessage.id}
                        className={`group flex gap-3 rounded-md px-2 py-1.5 hover:bg-[#f6f0e4] ${
                          isMine ? "flex-row-reverse" : ""
                        }`}
                      >
                        <Avatar
                          user={author}
                          className="mt-1 h-10 w-10 shrink-0 rounded-full border border-black/10"
                        />
                        <div
                          className={`max-w-[min(760px,82%)] min-w-0 ${
                            isMine ? "text-right" : ""
                          }`}
                        >
                          <div
                            className={`mb-1 flex items-baseline gap-2 ${
                              isMine ? "justify-end" : ""
                            }`}
                          >
                            <span className="text-sm font-semibold text-[#18221f]">
                              {getDisplayName(author)}
                            </span>
                            <time className="text-xs text-[#68716b]">
                              {formatTime(chatMessage.createdAt)}
                            </time>
                          </div>
                          <p
                            className={`rounded-2xl px-4 py-2 text-left leading-7 break-words whitespace-pre-wrap ${
                              isMine
                                ? "rounded-tr-md bg-[#114744] text-[#f6f0e4]"
                                : "rounded-tl-md border border-[#18221f]/10 bg-white text-[#18221f]"
                            }`}
                          >
                            {chatMessage.content}
                          </p>
                        </div>
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
                className="flex items-end gap-3 rounded-lg border border-[#18221f]/15 bg-white px-4 py-3 shadow-[6px_6px_0_#d8efee]"
              >
                <textarea
                  value={serverDraft}
                  onChange={(event) => setServerDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  className="max-h-36 min-h-11 flex-1 resize-none bg-transparent py-2 leading-6 text-[#18221f] placeholder:text-[#9aa49e] focus:outline-none"
                  placeholder={`#${selectedServerChannel?.name ?? "general"} へメッセージを送信`}
                  disabled={
                    !selectedServerChannel?.id || sendServerMessage.isPending
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
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="送信"
                >
                  <Send className="h-5 w-5" aria-hidden="true" />
                </button>
              </form>
            </>
          ) : (
            <>
              {message && (
                <p className="mb-2 rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] px-3 py-2 text-sm text-[#9f4122]">
                  {message}
                </p>
              )}
              <div className="mb-2 min-h-5 px-1 text-sm text-[#68716b]">
                {typingUserName ? `${typingUserName} が入力中...` : null}
              </div>
              <form
                onSubmit={handleSubmit}
                className="flex items-end gap-3 rounded-lg border border-[#18221f]/15 bg-white px-4 py-3 shadow-[6px_6px_0_#d8efee]"
              >
                <textarea
                  value={draft}
                  onChange={(event) => handleDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  className="max-h-36 min-h-11 flex-1 resize-none bg-transparent py-2 leading-6 text-[#18221f] placeholder:text-[#9aa49e] focus:outline-none"
                  placeholder={
                    selectedFriend
                      ? `${getDisplayName(selectedFriend)} へメッセージを送信`
                      : "フレンドを選択してください"
                  }
                  disabled={!selectedFriendId || sendMessage.isPending}
                  maxLength={1000}
                />
                <button
                  type="submit"
                  disabled={
                    !selectedFriendId || !draft.trim() || sendMessage.isPending
                  }
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="送信"
                >
                  <Send className="h-5 w-5" aria-hidden="true" />
                </button>
              </form>
            </>
          )}
        </div>
      </section>

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
    </main>
  );
}
