"use client";

import {
  Check,
  Copy,
  Hash,
  Inbox,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Server,
  Settings,
  Shield,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { api } from "~/trpc/react";

type ServerSelectionProps = {
  initialServerId?: string;
  userName?: string | null;
};

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "処理に失敗しました";
}

function getInvitePath(inviteCode?: string | null) {
  return inviteCode ? `/servers/invite/${inviteCode}` : "";
}

export function ServerSelection({
  initialServerId,
  userName,
}: ServerSelectionProps) {
  const utils = api.useUtils();
  const overview = api.server.getOverview.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const [selectedServerId, setSelectedServerId] = useState<string | null>(
    initialServerId ?? null,
  );
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );
  const [settingsServerId, setSettingsServerId] = useState<string | null>(null);
  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [isNewChannelFormOpen, setIsNewChannelFormOpen] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState("");
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    membershipId: string;
    x: number;
    y: number;
  } | null>(null);
  const [channelContextMenu, setChannelContextMenu] = useState<{
    channelId: string;
    x: number;
    y: number;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const memberships = overview.data?.memberships ?? [];
  const selected =
    memberships.find(
      (membership) => membership.server.id === selectedServerId,
    ) ?? memberships[0];
  const contextMembership = contextMenu
    ? memberships.find(
        (membership) => membership.id === contextMenu.membershipId,
      )
    : undefined;
  const settingsTarget = settingsServerId
    ? memberships.find(
        (membership) => membership.server.id === settingsServerId,
      )
    : undefined;
  const channelContextTarget = channelContextMenu
    ? selected?.server.channels.find(
        (channel) => channel.id === channelContextMenu.channelId,
      )
    : undefined;
  const selectedChannel = useMemo(() => {
    if (!selected) return null;

    return (
      selected.server.channels.find(
        (channel) => channel.id === selectedChannelId,
      ) ??
      selected.server.channels[0] ??
      null
    );
  }, [selected, selectedChannelId]);
  const userInitial = userName?.slice(0, 1);
  let initial = userInitial ?? "Y";
  if (initial.length === 0) {
    initial = "Y";
  }
  const conversation = api.server.getConversation.useQuery(
    {
      channelId: selectedChannel?.id,
      serverId: selected?.server.id ?? "",
    },
    {
      enabled: Boolean(selected?.server.id && selectedChannel?.id),
      refetchInterval:
        selected?.server.id && selectedChannel?.id ? 3000 : false,
    },
  );

  useEffect(() => {
    if (!contextMenu && !channelContextMenu) return;

    const closeMenu = () => {
      setContextMenu(null);
      setChannelContextMenu(null);
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
  }, [contextMenu, channelContextMenu]);

  useEffect(() => {
    setSelectedServerId(initialServerId ?? null);
  }, [initialServerId]);

  useEffect(() => {
    if (!selected) {
      setSelectedChannelId(null);
      setEditingChannelId(null);
      setEditingChannelName("");
      setNewChannelName("");
      setIsNewChannelFormOpen(false);
      setChannelContextMenu(null);
      return;
    }

    if (
      !selectedChannelId ||
      !selected.server.channels.some(
        (channel) => channel.id === selectedChannelId,
      )
    ) {
      setSelectedChannelId(selected.server.channels[0]?.id ?? null);
    }
  }, [selected, selectedChannelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [
    conversation.data?.messages.length,
    selected?.server.id,
    selectedChannel?.id,
  ]);

  const invalidateOverview = async () => {
    await utils.server.getOverview.invalidate();
  };

  const updateServer = api.server.update.useMutation({
    onSuccess: async () => {
      setSettingsServerId(null);
      setMessage("サーバー設定を保存しました");
      await invalidateOverview();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const rotateInvite = api.server.rotateInvite.useMutation({
    onSuccess: async () => {
      setMessage("招待リンクを再発行しました");
      await invalidateOverview();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const sendMessage = api.server.sendMessage.useMutation({
    onSuccess: async () => {
      setDraft("");
      setMessage(null);
      await utils.server.getConversation.invalidate({
        channelId: selectedChannel?.id,
        serverId: selected?.server.id ?? "",
      });
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const createChannel = api.server.createChannel.useMutation({
    onSuccess: async (channel) => {
      setNewChannelName("");
      setIsNewChannelFormOpen(false);
      setMessage(null);
      setSelectedChannelId(channel.id);
      await invalidateOverview();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const updateChannel = api.server.updateChannel.useMutation({
    onSuccess: async (channel) => {
      setEditingChannelId(null);
      setEditingChannelName("");
      setChannelContextMenu(null);
      setMessage(null);
      setSelectedChannelId(channel.id);
      await invalidateOverview();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const deleteChannel = api.server.deleteChannel.useMutation({
    onSuccess: async (_channel, variables) => {
      const nextChannel = selected?.server.channels.find(
        (channel) => channel.id !== variables.channelId,
      );

      setEditingChannelId(null);
      setEditingChannelName("");
      setChannelContextMenu(null);
      setMessage(null);
      setSelectedChannelId(nextChannel?.id ?? null);
      await Promise.all([
        invalidateOverview(),
        nextChannel
          ? utils.server.getConversation.invalidate({
              channelId: nextChannel.id,
              serverId: variables.serverId,
            })
          : Promise.resolve(),
      ]);
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const selectServer = (membership: (typeof memberships)[number]) => {
    setSelectedServerId(membership.server.id);
    setSelectedChannelId(membership.server.channels[0]?.id ?? null);
    setEditingChannelId(null);
    setEditingChannelName("");
    setNewChannelName("");
    setIsNewChannelFormOpen(false);
    setChannelContextMenu(null);
    setMessage(null);
  };

  const openServerMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    membership: (typeof memberships)[number],
  ) => {
    event.preventDefault();
    setChannelContextMenu(null);
    selectServer(membership);
    const menuWidth = 224;
    const menuHeight = 132;
    setContextMenu({
      membershipId: membership.id,
      x: Math.max(
        8,
        Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      ),
      y: Math.max(
        8,
        Math.min(event.clientY, window.innerHeight - menuHeight - 8),
      ),
    });
  };

  const openSettings = (membership: (typeof memberships)[number]) => {
    setContextMenu(null);
    setChannelContextMenu(null);
    setSelectedServerId(membership.server.id);
    setSelectedChannelId(membership.server.channels[0]?.id ?? null);
    setSettingsServerId(membership.server.id);
    setSettingsName(membership.server.name);
    setSettingsDescription(membership.server.description ?? "");
  };

  const openChannelMenu = (
    event: MouseEvent<HTMLDivElement>,
    channel: NonNullable<typeof selected>["server"]["channels"][number],
  ) => {
    if (selected?.role !== "OWNER") return;

    event.preventDefault();
    setContextMenu(null);
    setSelectedChannelId(channel.id);
    setChannelContextMenu({
      channelId: channel.id,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 192)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 104)),
    });
  };

  const openChannelEditor = (
    channel: NonNullable<typeof selected>["server"]["channels"][number],
  ) => {
    setChannelContextMenu(null);
    setEditingChannelId(channel.id);
    setEditingChannelName(channel.name);
  };

  const copyInviteLink = async (inviteCode?: string | null) => {
    const invitePath = getInvitePath(inviteCode);
    if (!invitePath) return;

    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${invitePath}`,
      );
      setMessage("招待リンクをコピーしました");
    } catch {
      setMessage("招待リンクをコピーできませんでした");
    } finally {
      setContextMenu(null);
    }
  };

  const rotateServerInvite = (membership: (typeof memberships)[number]) => {
    setContextMenu(null);
    rotateInvite.mutate({
      serverId: membership.server.id,
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected?.server.id || !selectedChannel?.id || !draft.trim()) return;

    sendMessage.mutate({
      channelId: selectedChannel.id,
      content: draft,
      serverId: selected.server.id,
    });
  };

  const handleCreateChannel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected?.server.id || !newChannelName.trim()) return;

    createChannel.mutate({
      name: newChannelName,
      serverId: selected.server.id,
    });
  };

  const handleUpdateChannel = (
    event: FormEvent<HTMLFormElement>,
    channelId: string,
  ) => {
    event.preventDefault();
    if (!selected?.server.id || !editingChannelName.trim()) return;

    updateChannel.mutate({
      channelId,
      name: editingChannelName,
      serverId: selected.server.id,
    });
  };

  const handleDeleteChannel = (channelId: string) => {
    if (!selected?.server.id) return;

    setChannelContextMenu(null);
    deleteChannel.mutate({
      channelId,
      serverId: selected.server.id,
    });
  };

  const conversationData = conversation.data ?? null;
  const messages = conversationData?.messages ?? [];

  if (overview.isLoading) {
    return (
      <main className="min-h-screen bg-[#f6f0e4] px-5 py-6 text-[#18221f]">
        <div className="mx-auto w-full max-w-7xl rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-6 text-sm text-[#68716b]">
          読み込み中...
        </div>
      </main>
    );
  }

  if (overview.error) {
    return (
      <main className="min-h-screen bg-[#f6f0e4] px-5 py-6 text-[#18221f]">
        <div className="mx-auto w-full max-w-7xl rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] p-6 text-sm text-[#9f4122]">
          {overview.error.message}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f0e4] text-[#18221f]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#18221f]/15 pb-5">
          <Link href="/servers" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4]">
              <Server className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-xl font-semibold">connect</span>
              <span className="block text-xs text-[#667163]">Server chat</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/friends"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#18221f]/20 bg-[#fff8ed] px-3 text-sm font-semibold text-[#18221f] transition hover:border-[#18221f]/45"
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              フレンド
            </Link>
            <Link
              href="/api/auth/signout"
              className="inline-flex h-10 items-center justify-center rounded-md bg-[#18221f] px-3 text-sm font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37]"
              aria-label="ログアウト"
              title="ログアウト"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </header>

        <section className="grid flex-1 gap-6 py-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-4 shadow-[8px_8px_0_#d8efee]">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[#18221f] font-semibold text-[#f6f0e4]">
                  {initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {userName ?? overview.data?.currentUser.userId}
                  </p>
                  <p className="text-sm text-[#68716b]">
                    @{overview.data?.currentUser.userId}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">サーバー</h2>
                <Link
                  href="/servers/new"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4] transition hover:bg-[#2f3c37]"
                  aria-label="サーバーを作成"
                  title="サーバーを作成"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <p className="text-xs leading-5 text-[#68716b]">
                サーバーを右クリックすると詳細設定を開けます。
              </p>
            </div>

            <div className="space-y-2">
              {memberships.map((membership) => (
                <button
                  key={membership.id}
                  type="button"
                  onClick={() => selectServer(membership)}
                  onContextMenu={(event) => openServerMenu(event, membership)}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition ${
                    membership.server.id === selected?.server.id
                      ? "border-[#18221f]/25 bg-[#18221f] text-[#f6f0e4]"
                      : "border-[#18221f]/15 bg-[#fff8ed] text-[#18221f] hover:border-[#18221f]/35"
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#d8efee] text-sm font-semibold text-[#114744]">
                    {membership.server.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {membership.server.name}
                    </span>
                    <span
                      className={`block truncate text-xs ${
                        membership.server.id === selected?.server.id
                          ? "text-[#d8efee]"
                          : "text-[#68716b]"
                      }`}
                    >
                      {membership.role === "OWNER" ? "管理者" : "メンバー"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 overflow-hidden rounded-md border border-[#18221f]/15 bg-[#fff8ed] shadow-[12px_12px_0_#d9e7d0]">
            {selected ? (
              <>
                <div className="flex h-16 items-center justify-between gap-4 border-b border-[#18221f]/15 bg-[#e4f2dc] px-5 sm:px-7">
                  <div className="flex min-w-0 items-center gap-3">
                    <Hash
                      className="h-5 w-5 shrink-0 text-[#68716b]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <h1 className="truncate text-lg font-semibold">
                        {selectedChannel?.name ?? "チャンネル"}
                      </h1>
                      <p className="truncate text-xs text-[#667163]">
                        {selected.server.name}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex h-10 items-center gap-2 rounded-md bg-[#fff8ed] px-3 text-sm font-semibold text-[#53615a]">
                    <Shield className="h-4 w-4" aria-hidden="true" />
                    {selected.role === "OWNER" ? "管理者" : "メンバー"}
                  </span>
                </div>

                <div className="grid min-h-[620px] gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="flex min-w-0 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
                      {message && (
                        <p className="mb-5 rounded-md border border-[#18221f]/10 bg-white px-3 py-2 text-sm text-[#53615a]">
                          {message}
                        </p>
                      )}

                      {conversation.isLoading && (
                        <div className="space-y-4">
                          {[0, 1, 2].map((item) => (
                            <div key={item} className="flex gap-3">
                              <div className="h-10 w-10 animate-pulse rounded-full bg-[#f1e4d0]" />
                              <div className="space-y-2">
                                <div className="h-4 w-32 animate-pulse rounded bg-[#f1e4d0]" />
                                <div className="h-10 w-80 max-w-[70vw] animate-pulse rounded bg-[#f1e4d0]" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {conversationData && messages.length === 0 && (
                        <div className="flex min-h-full items-end pb-8">
                          <div>
                            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#18221f] text-2xl font-semibold text-[#f6f0e4]">
                              {selected.server.name.slice(0, 2).toUpperCase()}
                            </div>
                            <h2 className="text-3xl font-semibold">
                              {selected.server.name}へようこそ
                            </h2>
                            <p className="mt-2 max-w-xl leading-7 text-[#53615a]">
                              #{selectedChannel?.name ?? "general"}
                              の最初のメッセージを送って、会話を始めましょう。
                            </p>
                          </div>
                        </div>
                      )}

                      {conversationData && messages.length > 0 && (
                        <div className="space-y-1">
                          {messages.map((chatMessage) => {
                            const isMine =
                              chatMessage.senderId ===
                              conversationData.currentUser.id;
                            const senderName =
                              chatMessage.sender.name ??
                              chatMessage.sender.userId;

                            return (
                              <article
                                key={chatMessage.id}
                                className={`group flex gap-3 rounded-md px-2 py-1.5 hover:bg-[#f6f0e4] ${
                                  isMine ? "flex-row-reverse" : ""
                                }`}
                              >
                                <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-[#114744] font-semibold text-[#f6f0e4]">
                                  {senderName.slice(0, 1).toUpperCase()}
                                </span>
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
                                      {isMine ? "あなた" : senderName}
                                    </span>
                                    <time className="text-xs text-[#68716b]">
                                      {new Intl.DateTimeFormat("ja-JP", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      }).format(chatMessage.createdAt)}
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
                    </div>

                    <div className="shrink-0 border-t border-[#18221f]/15 px-5 py-4 sm:px-7">
                      <form
                        onSubmit={handleSubmit}
                        className="flex items-end gap-3 rounded-lg border border-[#18221f]/15 bg-white px-4 py-3 shadow-[6px_6px_0_#d8efee]"
                      >
                        <textarea
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              event.currentTarget.form?.requestSubmit();
                            }
                          }}
                          className="max-h-36 min-h-11 flex-1 resize-none bg-transparent py-2 leading-6 text-[#18221f] placeholder:text-[#9aa49e] focus:outline-none"
                          placeholder={`#${selectedChannel?.name ?? "general"} へメッセージを送信`}
                          disabled={
                            !selectedChannel?.id || sendMessage.isPending
                          }
                          maxLength={1000}
                        />
                        <button
                          type="submit"
                          disabled={
                            !selectedChannel?.id ||
                            !draft.trim() ||
                            sendMessage.isPending
                          }
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="送信"
                        >
                          <Send className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </form>
                    </div>
                  </div>

                  <aside className="border-t border-[#18221f]/15 bg-[#f1e4d0] p-5 lg:border-t-0 lg:border-l">
                    <div className="mb-6">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-[#7b6757] uppercase">
                          テキストチャンネル
                        </h3>
                        {selected.role === "OWNER" && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsNewChannelFormOpen((isOpen) => !isOpen);
                              setEditingChannelId(null);
                              setEditingChannelName("");
                              setChannelContextMenu(null);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-[#7b6757] transition hover:bg-[#fff8ed] hover:text-[#18221f]"
                            aria-label="チャンネル追加フォームを開く"
                            title="チャンネルを追加"
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      {selected.role === "OWNER" && isNewChannelFormOpen && (
                        <form
                          onSubmit={handleCreateChannel}
                          className="mb-3 flex gap-2"
                        >
                          <input
                            value={newChannelName}
                            onChange={(event) =>
                              setNewChannelName(event.target.value)
                            }
                            className="min-h-9 min-w-0 flex-1 rounded-md border border-[#18221f]/15 bg-[#fff8ed] px-2 text-sm text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
                            placeholder="new-channel"
                            maxLength={32}
                            aria-label="チャンネル名"
                            autoFocus
                          />
                          <button
                            type="submit"
                            disabled={
                              !newChannelName.trim() || createChannel.isPending
                            }
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#18221f] text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:cursor-not-allowed disabled:opacity-45"
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
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#fff8ed] hover:text-[#18221f]"
                            aria-label="キャンセル"
                            title="キャンセル"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </form>
                      )}

                      <div className="space-y-1">
                        {selected.server.channels.map((channel) => {
                          const isSelected = channel.id === selectedChannel?.id;
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
                                  <Check
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
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
                              onContextMenu={(event) =>
                                openChannelMenu(event, channel)
                              }
                              className={`group flex min-h-10 items-center gap-1 rounded-md px-2 transition ${
                                isSelected
                                  ? "bg-[#18221f] text-[#f6f0e4]"
                                  : "text-[#53615a] hover:bg-[#fff8ed] hover:text-[#18221f]"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedChannelId(channel.id);
                                  setMessage(null);
                                }}
                                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              >
                                <Hash
                                  className="h-4 w-4 shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="truncate text-sm font-medium">
                                  {channel.name}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <h3 className="mb-3 text-xs font-semibold text-[#7b6757] uppercase">
                      メンバー
                    </h3>
                    <div className="space-y-2">
                      {selected.server.members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 rounded-md border border-[#18221f]/10 bg-[#fff8ed] px-3 py-3"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#d8efee] text-sm font-semibold text-[#114744]">
                            {(member.user.name ?? member.user.userId)
                              .slice(0, 1)
                              .toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {member.user.name ?? member.user.userId}
                            </p>
                            <p className="truncate text-xs text-[#68716b]">
                              {member.role === "OWNER" ? "管理者" : "メンバー"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </aside>
                </div>
              </>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center p-6 text-center">
                <div>
                  <Inbox
                    className="mx-auto mb-4 h-10 w-10 text-[#cc5f2f]"
                    aria-hidden="true"
                  />
                  <h1 className="text-2xl font-semibold">
                    サーバーがありません
                  </h1>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>

      {contextMenu && contextMembership && (
        <div
          className="fixed z-50 w-56 rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-1 text-sm text-[#18221f] shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
        >
          <button
            type="button"
            onClick={() => openSettings(contextMembership)}
            disabled={contextMembership.role !== "OWNER"}
            className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition hover:bg-[#e4f2dc] disabled:cursor-not-allowed disabled:opacity-45"
            role="menuitem"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            詳細設定
          </button>
          <button
            type="button"
            onClick={() => copyInviteLink(contextMembership.server.inviteCode)}
            disabled={
              contextMembership.role !== "OWNER" ||
              !contextMembership.server.inviteCode
            }
            className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition hover:bg-[#e4f2dc] disabled:cursor-not-allowed disabled:opacity-45"
            role="menuitem"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            招待リンクをコピー
          </button>
          <button
            type="button"
            onClick={() => rotateServerInvite(contextMembership)}
            disabled={
              contextMembership.role !== "OWNER" || rotateInvite.isPending
            }
            className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left transition hover:bg-[#e4f2dc] disabled:cursor-not-allowed disabled:opacity-45"
            role="menuitem"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            招待リンクを再発行
          </button>
        </div>
      )}

      {channelContextMenu && channelContextTarget && selected && (
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
              selected.server.channels.length <= 1 || deleteChannel.isPending
            }
            className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left text-[#9f4122] transition hover:bg-[#fff1e8] disabled:cursor-not-allowed disabled:opacity-45"
            role="menuitem"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            削除
          </button>
        </div>
      )}

      <Dialog
        open={settingsServerId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSettingsServerId(null);
          }
        }}
      >
        <DialogContent className="border border-[#18221f]/15 bg-[#fff8ed] text-[#18221f] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>サーバー詳細設定</DialogTitle>
          </DialogHeader>

          {settingsTarget && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                setMessage(null);
                updateServer.mutate({
                  serverId: settingsTarget.server.id,
                  name: settingsName,
                  description: settingsDescription,
                });
              }}
            >
              <label
                className="block text-sm font-semibold"
                htmlFor="settings-server-name"
              >
                サーバー名
              </label>
              <input
                id="settings-server-name"
                value={settingsName}
                onChange={(event) => setSettingsName(event.target.value)}
                className="min-h-11 w-full rounded-md border border-[#18221f]/20 bg-white px-3 py-2 text-[#18221f] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
                required
                maxLength={50}
              />
              <label
                className="block text-sm font-semibold"
                htmlFor="settings-server-description"
              >
                説明
              </label>
              <textarea
                id="settings-server-description"
                value={settingsDescription}
                onChange={(event) => setSettingsDescription(event.target.value)}
                className="min-h-24 w-full resize-none rounded-md border border-[#18221f]/20 bg-white px-3 py-2 text-[#18221f] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
                maxLength={160}
              />
              <button
                type="submit"
                disabled={updateServer.isPending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 py-2 text-sm font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:opacity-50"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {updateServer.isPending ? "保存中..." : "保存"}
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
