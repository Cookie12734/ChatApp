import {
  Bell,
  BookOpen,
  Hash,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";

const rooms = [
  {
    id: "lounge",
    name: "夜更かしラウンジ",
    initials: "夜",
    accent: "bg-[#d8efee] text-[#114744]",
    unread: 4,
    members: 128,
    online: 36,
    description: "雑談、作業通話、ちょっとした相談を気軽に置ける部屋。",
    channels: ["general", "作業部屋", "music", "announcements"],
  },
  {
    id: "dev",
    name: "Dev Studio",
    initials: "DS",
    accent: "bg-[#e4f2dc] text-[#224a22]",
    unread: 12,
    members: 84,
    online: 18,
    description: "プロダクト開発、コードレビュー、アイデア出しのための作業机。",
    channels: ["frontend", "backend", "design", "release"],
  },
  {
    id: "game",
    name: "Weekend Games",
    initials: "WG",
    accent: "bg-[#ffd8c6] text-[#8f3f1f]",
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
    accent: "bg-[#f8dda7] text-[#6c4b12]",
    unread: 2,
    members: 41,
    online: 7,
    description: "学習ログ、質問、ポモドーロ作業会をまとめる静かな部屋。",
    channels: ["today", "questions", "resources", "focus"],
  },
];

type ServerSelectionProps = {
  userImage?: string | null;
  userName?: string | null;
};

export function ServerSelection({ userImage, userName }: ServerSelectionProps) {
  const selectedRoom = rooms[0]!;
  const initial = userName?.slice(0, 1) ?? "Y";

  return (
    <main className="min-h-screen bg-[#f6f0e4] text-[#18221f]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#18221f]/15 pb-5">
          <Link href="/servers" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#18221f] text-lg font-semibold text-[#f6f0e4]">
              余
            </span>
            <span>
              <span className="block text-xl font-semibold">connect</span>
              <span className="block text-xs text-[#667163]">
                Rooms on your desk
              </span>
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
              href="/profile"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#18221f]/20 bg-[#fff8ed] px-3 text-sm font-semibold text-[#18221f] transition hover:border-[#18221f]/45"
            >
              <UserRound className="h-4 w-4" aria-hidden="true" />
              プロフィール
            </Link>
            <Link
              href="/api/auth/signout"
              className="inline-flex h-10 items-center justify-center rounded-md bg-[#18221f] px-3 text-sm font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37]"
              aria-label="ログアウト"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </header>

        <section className="grid flex-1 gap-6 py-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-4 shadow-[8px_8px_0_#d8efee]">
              <div className="flex items-center gap-3">
                {userImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={userImage}
                    alt=""
                    className="h-11 w-11 rounded-md border border-[#18221f]/15 object-cover"
                  />
                ) : (
                  <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[#18221f] font-semibold text-[#f6f0e4]">
                    {initial}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {userName ?? "connect user"}
                  </p>
                  <p className="text-sm text-[#68716b]">オンライン</p>
                </div>
              </div>
            </div>

            <label className="flex h-11 items-center gap-2 rounded-md border border-[#18221f]/15 bg-white px-3 text-sm text-[#68716b]">
              <Search className="h-4 w-4" aria-hidden="true" />
              <input
                className="min-w-0 flex-1 bg-transparent text-[#18221f] placeholder:text-[#9aa49e] focus:outline-none"
                placeholder="部屋を検索"
              />
            </label>

            <div className="space-y-2">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition ${
                    room.id === selectedRoom.id
                      ? "border-[#18221f]/25 bg-[#18221f] text-[#f6f0e4]"
                      : "border-[#18221f]/15 bg-[#fff8ed] text-[#18221f] hover:border-[#18221f]/35"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${room.accent}`}
                  >
                    {room.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {room.name}
                    </span>
                    <span
                      className={`block truncate text-xs ${
                        room.id === selectedRoom.id
                          ? "text-[#d8efee]"
                          : "text-[#68716b]"
                      }`}
                    >
                      {room.online}人オンライン
                    </span>
                  </span>
                  {room.unread > 0 && (
                    <span className="rounded-md bg-[#cc5f2f] px-2 py-1 text-xs font-semibold text-white">
                      {room.unread}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#18221f]/20 bg-[#fff8ed] px-4 py-3 text-sm font-semibold transition hover:border-[#18221f]/45"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              部屋を追加
            </button>
          </aside>

          <section className="min-w-0 rounded-md border border-[#18221f]/15 bg-[#fff8ed] shadow-[12px_12px_0_#d9e7d0]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#18221f]/15 bg-[#e4f2dc] px-5 py-5 sm:px-7">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#667163] uppercase">
                  Current room
                </p>
                <h1 className="mt-1 text-3xl font-semibold">
                  {selectedRoom.name}
                </h1>
                <p className="mt-2 max-w-2xl leading-7 text-[#53615a]">
                  {selectedRoom.description}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-md bg-[#fff8ed] text-[#53615a] transition hover:text-[#18221f]"
                  aria-label="通知"
                >
                  <Bell className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-md bg-[#fff8ed] text-[#53615a] transition hover:text-[#18221f]"
                  aria-label="メモ"
                >
                  <BookOpen className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0 p-5 sm:p-7">
                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "メンバー", value: `${selectedRoom.members}人` },
                    { label: "オンライン", value: `${selectedRoom.online}人` },
                    { label: "未読", value: `${selectedRoom.unread}件` },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-md border border-[#18221f]/10 bg-white px-4 py-3"
                    >
                      <p className="text-xs font-semibold text-[#667163] uppercase">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xl font-semibold">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-md border border-[#18221f]/10 bg-white p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <MessageCircle
                      className="h-5 w-5 text-[#cc5f2f]"
                      aria-hidden="true"
                    />
                    <h2 className="text-lg font-semibold">今日の入口を選ぶ</h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {rooms.map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        className="group rounded-md border border-[#18221f]/10 bg-[#f6f0e4] p-4 text-left transition hover:border-[#18221f]/35"
                      >
                        <span className="flex items-start gap-3">
                          <span
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${room.accent}`}
                          >
                            {room.initials}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">
                              {room.name}
                            </span>
                            <span className="mt-1 line-clamp-2 block text-sm leading-6 text-[#53615a]">
                              {room.description}
                            </span>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <aside className="border-t border-[#18221f]/15 bg-[#f1e4d0] p-5 lg:border-t-0 lg:border-l">
                <h3 className="mb-3 text-xs font-semibold text-[#7b6757] uppercase">
                  Channels
                </h3>
                <div className="space-y-1">
                  {selectedRoom.channels.map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      className="flex h-10 w-full items-center gap-2 rounded-md px-2 text-sm text-[#5f564d] transition hover:bg-[#fff8ed]"
                    >
                      <Hash className="h-4 w-4 text-[#9f4122]" />
                      <span className="truncate">{channel}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-6 rounded-md border border-[#18221f]/10 bg-[#fff8ed] p-4">
                  <Sparkles className="mb-3 h-5 w-5 text-[#cc5f2f]" />
                  <p className="font-semibold">はじめましょう</p>
                  <p className="mt-2 text-sm leading-6 text-[#68716b]">
                    部屋を選ぶと、その部屋のチャンネル一覧と最近の動きを確認できます。
                  </p>
                </div>
              </aside>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
