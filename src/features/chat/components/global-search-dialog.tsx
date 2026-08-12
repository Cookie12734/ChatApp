"use client";

import {
  Bookmark,
  CalendarDays,
  Compass,
  History,
  LoaderCircle,
  MessageCircle,
  Search,
  Server,
  UserRoundSearch,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  ProfileAvatar,
  getDisplayName,
} from "~/features/chat/components/chat-message";
import { api } from "~/trpc/react";

type SearchScope = "messages" | "people" | "servers" | "saved" | "matching";
type ServerCategory =
  | "COMMUNITY"
  | "GAMES"
  | "STUDY"
  | "HOBBIES"
  | "WELLBEING"
  | "OTHER";

const serverCategories = [
  ["", "すべてのカテゴリ"],
  ["COMMUNITY", "コミュニティ"],
  ["GAMES", "ゲーム"],
  ["STUDY", "学習"],
  ["HOBBIES", "趣味"],
  ["WELLBEING", "ウェルビーイング"],
  ["OTHER", "その他"],
] as const;

function startOfDay(value: string) {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

function endOfDay(value: string) {
  return value ? new Date(`${value}T23:59:59.999`) : undefined;
}

function optionalMemberCount(value: string) {
  if (!value) return undefined;
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 250
    ? count
    : undefined;
}

export function GlobalSearchDialog({
  onOpenChange,
  onOpenDirect,
  onOpenGroup,
  onOpenServer,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onOpenDirect: (friendId: string) => void;
  onOpenGroup: (groupId: string) => void;
  onOpenServer: (serverId: string, channelId?: string) => void;
  open: boolean;
}) {
  const [scope, setScope] = useState<SearchScope>("messages");
  const [query, setQuery] = useState("");
  const [senderUserId, setSenderUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [serverCategory, setServerCategory] = useState<ServerCategory | "">("");
  const [serverTags, setServerTags] = useState("");
  const [minMembers, setMinMembers] = useState("");
  const [maxMembers, setMaxMembers] = useState("");
  const [message, setMessage] = useState<string>();
  const utils = api.useUtils();
  const canSearchMessages =
    query.trim().length >= 2 || Boolean(senderUserId.trim() || from || to);
  const messageSearch = api.chat.searchMessages.useInfiniteQuery(
    {
      from: startOfDay(from),
      query: query.trim().length >= 2 ? query.trim() : undefined,
      senderUserId: senderUserId.trim() || undefined,
      to: endOfDay(to),
    },
    {
      enabled: open && scope === "messages" && canSearchMessages,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const userSearch = api.friend.searchUsers.useQuery(
    { query: query.trim() },
    { enabled: open && scope === "people" && query.trim().length >= 2 },
  );
  const recommendations = api.friend.getRecommendedUsers.useQuery(undefined, {
    enabled: open && scope === "people" && query.trim().length < 2,
  });
  const serverSearch = api.server.searchPublic.useInfiniteQuery(
    {
      category: serverCategory || undefined,
      maxMembers: optionalMemberCount(maxMembers),
      minMembers: optionalMemberCount(minMembers),
      query: query.trim() || undefined,
      tags:
        serverTags.trim().length > 0
          ? [
              ...new Set(
                serverTags
                  .toLowerCase()
                  .split(/[\s,]+/u)
                  .filter(Boolean),
              ),
            ].slice(0, 5)
          : undefined,
    },
    {
      enabled:
        open &&
        scope === "servers" &&
        (!minMembers || Boolean(optionalMemberCount(minMembers))) &&
        (!maxMembers || Boolean(optionalMemberCount(maxMembers))) &&
        (!minMembers ||
          !maxMembers ||
          Number(minMembers) <= Number(maxMembers)),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const savedMessages = api.chat.getSavedMessages.useQuery(
    { limit: 50 },
    { enabled: open && scope === "saved" },
  );
  const matchingHistory = api.chat.getMatchingHistory.useInfiniteQuery(
    {},
    {
      enabled: open && scope === "matching",
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const addFriend = api.friend.sendRequest.useMutation({
    onSuccess: () => setMessage("フレンド申請を送りました"),
    onError: (error) => setMessage(error.message),
  });
  const joinServer = api.server.joinPublic.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.server.getOverview.invalidate(),
        utils.server.searchPublic.invalidate(),
      ]);
      onOpenChange(false);
      onOpenServer(result.serverId);
    },
    onError: (error) => setMessage(error.message),
  });
  const requestRematch = api.chat.requestRematch.useMutation({
    onSuccess: async (result) => {
      await utils.chat.getMatchingHistory.invalidate();
      setMessage(
        result.status === "requested"
          ? "再マッチの希望を送りました"
          : "会話を開けるようになりました",
      );
      if (result.status !== "requested") {
        onOpenChange(false);
        onOpenDirect(result.peer.id);
      }
    },
    onError: (error) => setMessage(error.message),
  });

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onOpenChange]);

  const people = userSearch.data?.users ?? recommendations.data?.users ?? [];
  const messageResults =
    messageSearch.data?.pages.flatMap((page) => page.items) ?? [];
  const serverResults =
    serverSearch.data?.pages.flatMap((page) => page.servers) ?? [];
  const savedResults = savedMessages.data?.items ?? [];
  const matchingResults =
    matchingHistory.data?.pages.flatMap((page) => page.matches) ?? [];
  const isLoading =
    messageSearch.isFetching ||
    userSearch.isFetching ||
    recommendations.isFetching ||
    serverSearch.isFetching ||
    savedMessages.isFetching ||
    matchingHistory.isFetching;
  const tabs = useMemo(
    () =>
      [
        ["messages", "メッセージ", MessageCircle],
        ["people", "ユーザー", UserRoundSearch],
        ["servers", "公開サーバー", Compass],
        ["saved", "保存済み", Bookmark],
        ["matching", "マッチング履歴", History],
      ] as const,
    [],
  );

  const openResult = (result: {
    context: {
      channelId?: string;
      friendId?: string;
      groupId?: string;
      serverId?: string;
    };
    kind: "DIRECT" | "GROUP" | "SERVER";
  }) => {
    onOpenChange(false);
    if (result.kind === "DIRECT" && result.context.friendId) {
      onOpenDirect(result.context.friendId);
    } else if (result.kind === "SERVER" && result.context.serverId) {
      onOpenServer(result.context.serverId, result.context.channelId);
    } else if (result.kind === "GROUP" && result.context.groupId) {
      onOpenGroup(result.context.groupId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-connect-paper text-connect-ink flex max-h-[92dvh] min-h-[min(680px,92dvh)] flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-connect-ink/15 border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" aria-hidden="true" />
            横断検索
          </DialogTitle>
          <DialogDescription>
            DM・サーバー・グループをまたいで探せます。Ctrl / ⌘ + K
          </DialogDescription>
        </DialogHeader>
        <div
          className="border-connect-ink/15 flex gap-1 overflow-x-auto border-b px-3 py-2"
          role="tablist"
          aria-label="検索対象"
        >
          {tabs.map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={scope === value}
              onClick={() => {
                setScope(value);
                setMessage(undefined);
              }}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold ${scope === value ? "bg-connect-ink text-connect-paper" : "hover:bg-connect-highlight text-connect-muted"}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <div className="border-connect-ink/15 space-y-2 border-b p-3">
          {scope !== "saved" && scope !== "matching" && (
            <label className="border-connect-ink/15 bg-connect-surface focus-within:ring-connect-action flex min-h-11 items-center gap-2 rounded-md border px-3 focus-within:ring-2">
              <Search
                className="text-connect-muted h-4 w-4"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  scope === "servers"
                    ? "名前・説明・テーマ"
                    : scope === "people"
                      ? "名前・ユーザーID"
                      : "キーワード"
                }
                className="min-w-0 flex-1 bg-transparent outline-none"
                autoFocus
              />
            </label>
          )}
          {scope === "messages" && (
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                value={senderUserId}
                onChange={(event) => setSenderUserId(event.target.value)}
                placeholder="送信者ID"
                className="border-connect-ink/15 bg-connect-surface min-h-10 rounded-md border px-3 text-sm"
              />
              <label className="border-connect-ink/15 bg-connect-surface text-connect-muted flex min-h-10 items-center gap-2 rounded-md border px-2 text-xs">
                <CalendarDays className="h-4 w-4" />
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="min-w-0 bg-transparent"
                  aria-label="開始日"
                />
              </label>
              <label className="border-connect-ink/15 bg-connect-surface text-connect-muted flex min-h-10 items-center gap-2 rounded-md border px-2 text-xs">
                <CalendarDays className="h-4 w-4" />
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="min-w-0 bg-transparent"
                  aria-label="終了日"
                />
              </label>
            </div>
          )}
          {scope === "servers" && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={serverCategory}
                onChange={(event) =>
                  setServerCategory(event.target.value as ServerCategory | "")
                }
                aria-label="サーバーカテゴリ"
                className="border-connect-ink/15 bg-connect-surface col-span-2 min-h-10 rounded-md border px-3 text-sm sm:col-span-1"
              >
                {serverCategories.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                value={serverTags}
                onChange={(event) => setServerTags(event.target.value)}
                placeholder="タグ（例: 初心者歓迎, 音楽）"
                aria-label="サーバータグ"
                className="border-connect-ink/15 bg-connect-surface col-span-2 min-h-10 rounded-md border px-3 text-sm sm:col-span-1"
              />
              <label className="text-connect-muted text-xs">
                最小人数
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={250}
                  value={minMembers}
                  onChange={(event) => setMinMembers(event.target.value)}
                  className="border-connect-ink/15 bg-connect-surface text-connect-ink mt-1 min-h-10 w-full rounded-md border px-3 text-sm"
                />
              </label>
              <label className="text-connect-muted text-xs">
                最大人数
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={250}
                  value={maxMembers}
                  onChange={(event) => setMaxMembers(event.target.value)}
                  className="border-connect-ink/15 bg-connect-surface text-connect-ink mt-1 min-h-10 w-full rounded-md border px-3 text-sm"
                />
              </label>
              {minMembers &&
                maxMembers &&
                Number(minMembers) > Number(maxMembers) && (
                  <p
                    className="text-connect-danger col-span-2 text-xs"
                    role="alert"
                  >
                    最小人数は最大人数以下にしてください。
                  </p>
                )}
            </div>
          )}
        </div>

        <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
          {isLoading && (
            <p className="text-connect-muted flex items-center gap-2 p-4 text-sm">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              検索中…
            </p>
          )}
          {scope === "messages" && !canSearchMessages && (
            <p className="text-connect-muted p-4 text-sm">
              2文字以上のキーワード、送信者、または日付を指定してください。
            </p>
          )}
          {scope === "messages" &&
            messageResults.map((result) => (
              <button
                key={`${result.kind}:${result.id}`}
                type="button"
                onClick={() => openResult(result)}
                className="border-connect-ink/10 hover:bg-connect-highlight mb-1 flex w-full gap-3 rounded-md border-b p-3 text-left"
              >
                <ProfileAvatar user={result.sender} className="h-9 w-9" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-semibold">
                      {getDisplayName(result.sender)}
                    </span>
                    <span className="text-connect-muted text-xs">
                      {result.kind === "DIRECT"
                        ? "DM"
                        : result.kind === "SERVER"
                          ? `${result.context.serverName} / ${result.context.channelName}`
                          : (result.context.groupName ?? "グループDM")}
                    </span>
                    <time className="text-connect-muted text-xs">
                      {result.createdAt.toLocaleDateString("ja-JP")}
                    </time>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm">
                    {result.content}
                  </span>
                </span>
              </button>
            ))}
          {scope === "messages" && messageSearch.hasNextPage && (
            <button
              type="button"
              onClick={() => void messageSearch.fetchNextPage()}
              disabled={messageSearch.isFetchingNextPage}
              className="border-connect-ink/15 bg-connect-surface hover:bg-connect-highlight mx-auto mt-3 block min-h-10 rounded-md border px-4 text-sm font-semibold disabled:opacity-50"
            >
              {messageSearch.isFetchingNextPage ? "読み込み中…" : "さらに表示"}
            </button>
          )}

          {scope === "people" &&
            people.map((person) => (
              <div
                key={person.userId}
                className="border-connect-ink/10 flex items-center gap-3 border-b p-3"
              >
                <ProfileAvatar user={person} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {getDisplayName(person)}
                  </p>
                  <p className="text-connect-muted truncate text-xs">
                    @{person.userId} · 共通サーバー {person.sharedServerCount}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addFriend.mutate({ userId: person.userId })}
                  disabled={addFriend.isPending}
                  className="border-connect-action text-connect-action hover:bg-connect-highlight min-h-10 rounded-md border px-3 text-sm font-semibold disabled:opacity-50"
                >
                  申請
                </button>
              </div>
            ))}

          {scope === "servers" &&
            serverResults.map((server) => (
              <div
                key={server.id}
                className="border-connect-ink/10 flex items-start gap-3 border-b p-3"
              >
                <div className="bg-connect-ink text-connect-paper flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
                  <Server className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{server.name}</p>
                  <p className="text-connect-muted line-clamp-2 text-sm">
                    {server.description ?? "説明はありません"}
                  </p>
                  <p className="text-connect-muted mt-1 text-xs">
                    {server.memberCount}人 ·{" "}
                    {serverCategories.find(
                      ([value]) => value === server.category,
                    )?.[1] ?? "カテゴリなし"}{" "}
                    {server.tags.map((tag) => `#${tag}`).join(" ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    server.isMember
                      ? (onOpenChange(false), onOpenServer(server.id))
                      : joinServer.mutate({ serverId: server.id })
                  }
                  disabled={joinServer.isPending}
                  className="bg-connect-action text-connect-surface hover:bg-connect-action-hover min-h-10 rounded-md px-3 text-sm font-semibold disabled:opacity-50"
                >
                  {server.isMember ? "開く" : "参加"}
                </button>
              </div>
            ))}
          {scope === "servers" && serverSearch.hasNextPage && (
            <button
              type="button"
              onClick={() => void serverSearch.fetchNextPage()}
              disabled={serverSearch.isFetchingNextPage}
              className="border-connect-ink/15 bg-connect-surface hover:bg-connect-highlight mx-auto mt-3 block min-h-10 rounded-md border px-4 text-sm font-semibold disabled:opacity-50"
            >
              {serverSearch.isFetchingNextPage ? "読み込み中…" : "さらに表示"}
            </button>
          )}

          {scope === "saved" &&
            savedResults.map((result) => (
              <button
                key={`${result.kind}:${result.id}`}
                type="button"
                onClick={() => openResult(result)}
                className="border-connect-ink/10 hover:bg-connect-highlight mb-1 w-full rounded-md border-b p-3 text-left"
              >
                <span className="text-connect-muted flex items-center gap-2 text-xs">
                  <Bookmark className="h-3 w-3" />
                  {result.kind === "DIRECT"
                    ? "DM"
                    : result.kind === "SERVER"
                      ? result.context.serverName
                      : (result.context.groupName ?? "グループDM")}
                </span>
                <span className="mt-1 block font-semibold">
                  {getDisplayName(result.sender)}
                </span>
                <span className="line-clamp-2 text-sm">{result.content}</span>
              </button>
            ))}
          {scope === "matching" &&
            matchingResults.map((match) => (
              <div
                key={match.id}
                className="border-connect-ink/10 flex items-center gap-3 border-b p-3"
              >
                <ProfileAvatar user={match.peer} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{getDisplayName(match.peer)}</p>
                  <p className="text-connect-muted text-xs">
                    {match.topic === "CASUAL"
                      ? "雑談"
                      : match.topic === "GAME"
                        ? "ゲーム"
                        : "悩み事"}{" "}
                    · {match.createdAt.toLocaleDateString("ja-JP")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    match.canOpenDm
                      ? (onOpenChange(false), onOpenDirect(match.peer.id))
                      : requestRematch.mutate({ matchId: match.id })
                  }
                  disabled={requestRematch.isPending}
                  className="border-connect-action text-connect-action hover:bg-connect-highlight min-h-10 rounded-md border px-3 text-sm font-semibold"
                >
                  {match.canOpenDm ? "会話を開く" : "再マッチ"}
                </button>
              </div>
            ))}
          {scope === "matching" && matchingHistory.hasNextPage && (
            <button
              type="button"
              onClick={() => void matchingHistory.fetchNextPage()}
              disabled={matchingHistory.isFetchingNextPage}
              className="border-connect-ink/15 bg-connect-surface hover:bg-connect-highlight mx-auto mt-3 block min-h-10 rounded-md border px-4 text-sm font-semibold disabled:opacity-50"
            >
              {matchingHistory.isFetchingNextPage
                ? "読み込み中…"
                : "さらに表示"}
            </button>
          )}
          {message && (
            <p role="status" className="text-connect-muted p-3 text-sm">
              {message}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
