import Link from "next/link";
import {
  Bell,
  Compass,
  Hash,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

const servers = [
  {
    id: "lounge",
    name: "夜更かしラウンジ",
    initials: "夜",
    accent: "bg-indigo-500",
    unread: 4,
    members: 128,
    online: 36,
    description: "雑談、作業通話、ちょっとした相談を気軽に置ける場所。",
    channels: ["general", "作業部屋", "music", "announcements"],
  },
  {
    id: "dev",
    name: "Dev Studio",
    initials: "DS",
    accent: "bg-emerald-500",
    unread: 12,
    members: 84,
    online: 18,
    description:
      "プロダクト開発、コードレビュー、アイデア出しのためのサーバー。",
    channels: ["frontend", "backend", "design", "release"],
  },
  {
    id: "game",
    name: "Weekend Games",
    initials: "WG",
    accent: "bg-rose-500",
    unread: 0,
    members: 52,
    online: 9,
    description: "週末のゲーム募集とボイスチャット用の集合場所。",
    channels: ["party", "clips", "voice-chat", "schedule"],
  },
  {
    id: "study",
    name: "Study Room",
    initials: "SR",
    accent: "bg-amber-400",
    unread: 2,
    members: 41,
    online: 7,
    description: "学習ログ、質問、ポモドーロ作業会をまとめる静かな部屋。",
    channels: ["today", "questions", "resources", "focus"],
  },
];

type ServerSelectionProps = {
  userName?: string | null;
};

export function ServerSelection({ userName }: ServerSelectionProps) {
  const selectedServer = servers[0]!;

  return (
    <main className="min-h-screen bg-[#1e1f22] text-zinc-100">
      <div className="grid min-h-screen grid-cols-[72px_minmax(0,1fr)] md:grid-cols-[72px_280px_minmax(0,1fr)]">
        <aside className="flex flex-col items-center gap-3 bg-[#1a1b1e] px-3 py-4">
          <Link
            href="/servers"
            className="flex size-12 items-center justify-center rounded-2xl bg-[#5865f2] text-white shadow-lg shadow-indigo-950/40 transition hover:rounded-xl"
            aria-label="ホーム"
          >
            <MessageCircle className="size-6" />
          </Link>

          <div className="h-px w-8 bg-zinc-700" />

          {servers.map((server) => (
            <button
              key={server.id}
              type="button"
              className="group relative flex size-12 items-center justify-center rounded-3xl bg-[#313338] text-sm font-bold transition hover:rounded-xl hover:bg-[#5865f2] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
              aria-label={server.name}
            >
              {server.id === selectedServer.id && (
                <span className="absolute -left-3 h-10 w-1 rounded-r-full bg-white" />
              )}
              <span
                className={`flex size-9 items-center justify-center rounded-2xl ${server.accent} text-zinc-950 transition group-hover:rounded-xl`}
              >
                {server.initials}
              </span>
              {server.unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-red-500 px-1.5 text-[11px] leading-5 font-bold text-white">
                  {server.unread}
                </span>
              )}
            </button>
          ))}

          <button
            type="button"
            className="flex size-12 items-center justify-center rounded-3xl bg-[#313338] text-emerald-400 transition hover:rounded-xl hover:bg-emerald-500 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            aria-label="サーバーを追加"
          >
            <Plus className="size-6" />
          </button>

          <button
            type="button"
            className="flex size-12 items-center justify-center rounded-3xl bg-[#313338] text-zinc-300 transition hover:rounded-xl hover:bg-zinc-600 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            aria-label="サーバーを探す"
          >
            <Compass className="size-6" />
          </button>
        </aside>

        <aside className="hidden border-r border-black/30 bg-[#2b2d31] md:flex md:flex-col">
          <div className="flex h-14 items-center border-b border-black/30 px-4">
            <h1 className="truncate text-base font-semibold">サーバー選択</h1>
          </div>

          <div className="p-3">
            <label className="flex h-9 items-center gap-2 rounded-md bg-[#1e1f22] px-3 text-sm text-zinc-400">
              <Search className="size-4" />
              <input
                className="min-w-0 flex-1 bg-transparent text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
                placeholder="サーバーを検索"
              />
            </label>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
            {servers.map((server) => (
              <button
                key={server.id}
                type="button"
                className={`flex h-12 w-full items-center gap-3 rounded-md px-2 text-left transition ${
                  server.id === selectedServer.id
                    ? "bg-zinc-700/70 text-white"
                    : "text-zinc-300 hover:bg-zinc-700/40 hover:text-white"
                }`}
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${server.accent} text-sm font-bold text-zinc-950`}
                >
                  {server.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {server.name}
                  </span>
                  <span className="block truncate text-xs text-zinc-400">
                    {server.online}人オンライン
                  </span>
                </span>
                {server.unread > 0 && (
                  <span className="rounded-full bg-red-500 px-2 text-xs font-semibold text-white">
                    {server.unread}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="border-t border-black/30 bg-[#232428] p-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-zinc-600 text-sm font-semibold">
                {(userName ?? "U").slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {userName ?? "ユーザー"}
                </p>
                <p className="text-xs text-emerald-400">オンライン</p>
              </div>
              <Link
                href="/api/auth/signout"
                className="flex size-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
                aria-label="ログアウト"
              >
                <LogOut className="size-4" />
              </Link>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col bg-[#313338]">
          <header className="flex h-14 items-center justify-between border-b border-black/30 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <Hash className="size-5 shrink-0 text-zinc-400" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold md:text-base">
                  {selectedServer.name}
                </h2>
                <p className="hidden truncate text-xs text-zinc-400 sm:block">
                  {selectedServer.description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href="/friends"
                className="flex size-9 items-center justify-center rounded-md text-zinc-300 transition hover:bg-zinc-700 hover:text-white"
                aria-label="フレンド"
              >
                <Users className="size-5" />
              </Link>
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-md text-zinc-300 transition hover:bg-zinc-700 hover:text-white"
                aria-label="通知"
              >
                <Bell className="size-5" />
              </button>
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-md text-zinc-300 transition hover:bg-zinc-700 hover:text-white"
                aria-label="設定"
              >
                <Settings className="size-5" />
              </button>
            </div>
          </header>

          <div className="grid flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 overflow-y-auto p-4 sm:p-6">
              <div className="mb-5 flex items-center gap-3 rounded-lg border border-white/10 bg-[#2b2d31] p-4">
                <div
                  className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${selectedServer.accent} text-lg font-bold text-zinc-950`}
                >
                  {selectedServer.initials}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-xl font-bold">
                    {selectedServer.name}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">
                    参加するサーバーを選択してください。チャンネルやメンバーの様子を確認してから入れます。
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {servers.map((server) => (
                  <button
                    key={server.id}
                    type="button"
                    className={`group flex min-h-36 flex-col items-start justify-between rounded-lg border p-4 text-left transition ${
                      server.id === selectedServer.id
                        ? "border-[#5865f2] bg-[#2b2d31]"
                        : "border-white/10 bg-[#2b2d31]/70 hover:border-zinc-500 hover:bg-[#2b2d31]"
                    }`}
                  >
                    <span className="flex w-full items-start gap-3">
                      <span
                        className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${server.accent} font-bold text-zinc-950 transition group-hover:rounded-xl`}
                      >
                        {server.initials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-white">
                          {server.name}
                        </span>
                        <span className="mt-1 line-clamp-2 block text-sm leading-6 text-zinc-400">
                          {server.description}
                        </span>
                      </span>
                    </span>
                    <span className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
                      <span className="rounded bg-[#1e1f22] px-2 py-1">
                        {server.members} members
                      </span>
                      <span className="rounded bg-[#1e1f22] px-2 py-1 text-emerald-300">
                        {server.online} online
                      </span>
                      {server.unread > 0 && (
                        <span className="rounded bg-red-500/20 px-2 py-1 text-red-200">
                          {server.unread} unread
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <aside className="hidden border-l border-black/30 bg-[#2b2d31] p-4 xl:block">
              <h3 className="mb-3 text-xs font-semibold text-zinc-400 uppercase">
                チャンネル
              </h3>
              <div className="space-y-1">
                {selectedServer.channels.map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-zinc-300 transition hover:bg-zinc-700/50 hover:text-white"
                  >
                    <Hash className="size-4 text-zinc-500" />
                    <span className="truncate">{channel}</span>
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-lg bg-[#1e1f22] p-4">
                <Sparkles className="mb-3 size-5 text-amber-300" />
                <p className="text-sm font-semibold">はじめましょう</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  サーバーを選ぶと、そのサーバーのチャンネル一覧と最近のアクティビティを表示できます。
                </p>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
