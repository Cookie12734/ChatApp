"use client";

import {
  Copy,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Server,
  Settings,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "~/trpc/react";

type ServerSelectionProps = {
  userName?: string | null;
};

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "処理に失敗しました";
}

export function ServerSelection({ userName }: ServerSelectionProps) {
  const utils = api.useUtils();
  const overview = api.server.getOverview.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [newServerName, setNewServerName] = useState("");
  const [newServerDescription, setNewServerDescription] = useState("");
  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const memberships = overview.data?.memberships ?? [];
  const selected =
    memberships.find(
      (membership) => membership.server.id === selectedServerId,
    ) ?? memberships[0];
  const isOwner = selected?.role === "OWNER";
  const invitePath = selected?.server.inviteCode
    ? `/servers/invite/${selected.server.inviteCode}`
    : "";
  const initial = userName?.slice(0, 1) || "Y";

  useEffect(() => {
    if (!selected) return;
    setSettingsName(selected.server.name);
    setSettingsDescription(selected.server.description ?? "");
  }, [
    selected?.server.description,
    selected?.server.id,
    selected?.server.name,
  ]);

  const invalidateOverview = async () => {
    await utils.server.getOverview.invalidate();
  };

  const createServer = api.server.create.useMutation({
    onSuccess: async (server) => {
      setNewServerName("");
      setNewServerDescription("");
      setSelectedServerId(server.id);
      setMessage("サーバーを作成しました");
      await invalidateOverview();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const updateServer = api.server.update.useMutation({
    onSuccess: async () => {
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

  const copyInviteLink = async () => {
    if (!invitePath) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${invitePath}`,
      );
      setMessage("招待リンクをコピーしました");
    } catch {
      setMessage("招待リンクをコピーできませんでした");
    }
  };

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

            <form
              className="space-y-2 rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-4"
              onSubmit={(event) => {
                event.preventDefault();
                setMessage(null);
                createServer.mutate({
                  name: newServerName,
                  description: newServerDescription,
                });
              }}
            >
              <label
                className="block text-sm font-semibold"
                htmlFor="server-name"
              >
                新しいサーバー
              </label>
              <input
                id="server-name"
                value={newServerName}
                onChange={(event) => setNewServerName(event.target.value)}
                className="min-h-11 w-full rounded-md border border-[#18221f]/20 bg-white px-3 py-2 text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
                placeholder="サーバー名"
                required
                maxLength={50}
              />
              <textarea
                value={newServerDescription}
                onChange={(event) =>
                  setNewServerDescription(event.target.value)
                }
                className="min-h-20 w-full resize-none rounded-md border border-[#18221f]/20 bg-white px-3 py-2 text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
                placeholder="説明"
                maxLength={160}
              />
              <button
                type="submit"
                disabled={createServer.isPending}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 py-2 text-sm font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {createServer.isPending ? "作成中..." : "作成"}
              </button>
            </form>

            <div className="space-y-2">
              {memberships.map((membership) => (
                <button
                  key={membership.id}
                  type="button"
                  onClick={() => setSelectedServerId(membership.server.id)}
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

          <section className="min-w-0 rounded-md border border-[#18221f]/15 bg-[#fff8ed] shadow-[12px_12px_0_#d9e7d0]">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#18221f]/15 bg-[#e4f2dc] px-5 py-5 sm:px-7">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#667163] uppercase">
                      {selected.role === "OWNER" ? "管理者" : "メンバー"}
                    </p>
                    <h1 className="mt-1 text-3xl font-semibold">
                      {selected.server.name}
                    </h1>
                    {selected.server.description && (
                      <p className="mt-2 max-w-2xl leading-7 text-[#53615a]">
                        {selected.server.description}
                      </p>
                    )}
                  </div>
                  <span className="inline-flex h-10 items-center gap-2 rounded-md bg-[#fff8ed] px-3 text-sm font-semibold text-[#53615a]">
                    <Shield className="h-4 w-4" aria-hidden="true" />
                    {selected.role === "OWNER" ? "管理者" : "メンバー"}
                  </span>
                </div>

                <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="min-w-0 space-y-5 p-5 sm:p-7">
                    {message && (
                      <p className="rounded-md border border-[#18221f]/10 bg-white px-3 py-2 text-sm text-[#53615a]">
                        {message}
                      </p>
                    )}

                    <section className="rounded-md border border-[#18221f]/10 bg-white p-5">
                      <div className="mb-4 flex items-center gap-3">
                        <Settings
                          className="h-5 w-5 text-[#cc5f2f]"
                          aria-hidden="true"
                        />
                        <h2 className="text-lg font-semibold">サーバー設定</h2>
                      </div>

                      {isOwner ? (
                        <form
                          className="space-y-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (!selected) return;
                            setMessage(null);
                            updateServer.mutate({
                              serverId: selected.server.id,
                              name: settingsName,
                              description: settingsDescription,
                            });
                          }}
                        >
                          <input
                            value={settingsName}
                            onChange={(event) =>
                              setSettingsName(event.target.value)
                            }
                            className="min-h-11 w-full rounded-md border border-[#18221f]/20 bg-[#f6f0e4] px-3 py-2 text-[#18221f] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
                            required
                            maxLength={50}
                          />
                          <textarea
                            value={settingsDescription}
                            onChange={(event) =>
                              setSettingsDescription(event.target.value)
                            }
                            className="min-h-24 w-full resize-none rounded-md border border-[#18221f]/20 bg-[#f6f0e4] px-3 py-2 text-[#18221f] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
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
                      ) : (
                        <p className="text-sm text-[#68716b]">
                          設定を変更できるのは管理者のみです。
                        </p>
                      )}
                    </section>

                    {isOwner && (
                      <section className="rounded-md border border-[#18221f]/10 bg-white p-5">
                        <div className="mb-4 flex items-center gap-3">
                          <UserPlus
                            className="h-5 w-5 text-[#cc5f2f]"
                            aria-hidden="true"
                          />
                          <h2 className="text-lg font-semibold">招待リンク</h2>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            value={invitePath}
                            readOnly
                            className="min-h-11 flex-1 rounded-md border border-[#18221f]/20 bg-[#f6f0e4] px-3 py-2 font-mono text-sm text-[#18221f]"
                          />
                          <button
                            type="button"
                            onClick={copyInviteLink}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 py-2 text-sm font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37]"
                          >
                            <Copy className="h-4 w-4" aria-hidden="true" />
                            コピー
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              rotateInvite.mutate({
                                serverId: selected.server.id,
                              })
                            }
                            disabled={rotateInvite.isPending}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#18221f]/20 bg-[#fff8ed] px-4 py-2 text-sm font-semibold text-[#18221f] transition hover:border-[#18221f]/45 disabled:opacity-50"
                          >
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            再発行
                          </button>
                        </div>
                      </section>
                    )}
                  </div>

                  <aside className="border-t border-[#18221f]/15 bg-[#f1e4d0] p-5 lg:border-t-0 lg:border-l">
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
                  <Server
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
    </main>
  );
}
