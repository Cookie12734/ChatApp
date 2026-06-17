"use client";

import { Bell, Check, Send, UserPlus, X } from "lucide-react";
import { useState } from "react";

import { api } from "~/trpc/react";

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "処理に失敗しました";
}

export function FriendPanel() {
  const utils = api.useUtils();
  const [targetUserId, setTargetUserId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const overview = api.friend.getOverview.useQuery(undefined, {
    refetchInterval: 15000,
  });

  const invalidateOverview = async () => {
    await utils.friend.getOverview.invalidate();
  };

  const sendRequest = api.friend.sendRequest.useMutation({
    onSuccess: async () => {
      setTargetUserId("");
      setMessage("フレンド申請を送信しました");
      await invalidateOverview();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const acceptRequest = api.friend.acceptRequest.useMutation({
    onSuccess: async () => {
      setMessage("フレンド申請を承認しました");
      await invalidateOverview();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const declineRequest = api.friend.declineRequest.useMutation({
    onSuccess: async () => {
      setMessage("フレンド申請を拒否しました");
      await invalidateOverview();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const markNotificationsRead = api.friend.markNotificationsRead.useMutation({
    onSuccess: invalidateOverview,
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  if (overview.isLoading) {
    return (
      <div className="w-full max-w-4xl rounded-lg border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
        読み込み中...
      </div>
    );
  }

  if (overview.error) {
    return (
      <div className="w-full max-w-4xl rounded-lg border border-red-900/60 bg-red-950/20 p-6 text-sm text-red-300">
        {overview.error.message}
      </div>
    );
  }

  const data = overview.data;
  if (!data) return null;

  return (
    <section className="grid w-full max-w-5xl gap-4 text-left lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">フレンド</h2>
              <p className="text-sm text-zinc-400">
                あなたのユーザーID:{" "}
                <span className="font-mono text-zinc-200">
                  {data.currentUser.userId}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
              <Bell className="h-4 w-4" />
              未読 {data.unreadNotificationCount}
            </div>
          </div>

          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              setMessage(null);
              sendRequest.mutate({ userId: targetUserId });
            }}
          >
            <input
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
              className="min-h-11 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              placeholder="申請するユーザーID"
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]+"
            />
            <button
              type="submit"
              disabled={sendRequest.isPending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sendRequest.isPending ? "送信中..." : "申請"}
            </button>
          </form>

          {message && (
            <p className="mt-3 rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
              {message}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <h3 className="mb-3 text-base font-semibold">届いた申請</h3>
          {data.incomingRequests.length > 0 ? (
            <div className="space-y-3">
              {data.incomingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-900 px-4 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {request.sender.name ?? request.sender.userId}
                    </p>
                    <p className="font-mono text-sm text-zinc-400">
                      {request.sender.userId}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        acceptRequest.mutate({ requestId: request.id })
                      }
                      disabled={acceptRequest.isPending}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
                      aria-label="承認"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        declineRequest.mutate({ requestId: request.id })
                      }
                      disabled={declineRequest.isPending}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-50"
                      aria-label="拒否"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">未処理の申請はありません</p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <h3 className="mb-3 text-base font-semibold">フレンド一覧</h3>
          {data.friends.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.friends.map((friendship) => (
                <div
                  key={friendship.id}
                  className="flex items-center gap-3 rounded-lg bg-zinc-900 px-4 py-3"
                >
                  <UserPlus className="h-4 w-4 text-zinc-400" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {friendship.friend.name ?? friendship.friend.userId}
                    </p>
                    <p className="truncate font-mono text-sm text-zinc-400">
                      {friendship.friend.userId}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              まだフレンドはいません。ユーザーIDで申請してみましょう。
            </p>
          )}
        </div>
      </div>

      <aside className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">通知</h3>
          <button
            type="button"
            onClick={() => markNotificationsRead.mutate()}
            disabled={
              data.unreadNotificationCount === 0 ||
              markNotificationsRead.isPending
            }
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-900 disabled:opacity-50"
          >
            既読
          </button>
        </div>
        {data.notifications.length > 0 ? (
          <div className="space-y-2">
            {data.notifications.map((notification) => (
              <div
                key={notification.id}
                className="rounded-lg bg-zinc-900 px-3 py-3 text-sm"
              >
                <div className="flex items-start gap-2">
                  {!notification.readAt && (
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-400" />
                  )}
                  <p className="leading-6 text-zinc-300">
                    {notification.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">通知はありません</p>
        )}
      </aside>
    </section>
  );
}
