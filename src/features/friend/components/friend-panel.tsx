"use client";

import {
  Ban,
  Bell,
  Check,
  Inbox,
  Send,
  Undo2,
  UserPlus,
  X,
} from "lucide-react";
import { useState } from "react";

import { UserProfileDialog } from "~/features/profile/components/user-profile-dialog";
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
      setMessage("フレンド申請を見送りました");
      await invalidateOverview();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });
  const cancelRequest = api.friend.cancelRequest.useMutation({
    onSuccess: async () => {
      setMessage("フレンド申請を取り消しました");
      await invalidateOverview();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const markNotificationsRead = api.friend.markNotificationsRead.useMutation({
    onSuccess: invalidateOverview,
    onError: (error) => setMessage(getErrorMessage(error)),
  });
  const blockUser = api.friend.blockUser.useMutation({
    onSuccess: async () => {
      setMessage("ユーザーをブロックしました");
      await invalidateOverview();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });
  const unblockUser = api.friend.unblockUser.useMutation({
    onSuccess: async () => {
      setMessage("ブロックを解除しました");
      await invalidateOverview();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  if (overview.isLoading) {
    return (
      <div className="w-full rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-6 text-sm text-[#68716b]">
        読み込み中...
      </div>
    );
  }

  if (overview.error) {
    return (
      <div className="w-full rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] p-6 text-sm text-[#9f4122]">
        {overview.error.message}
      </div>
    );
  }

  const data = overview.data;
  if (!data) return null;

  return (
    <section className="grid w-full gap-5 text-left lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <div className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-5 shadow-[8px_8px_0_#d8efee]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">フレンド</h2>
              <p className="mt-1 text-sm text-[#68716b]">
                あなたのユーザーID:{" "}
                <span className="font-mono text-[#18221f]">
                  {data.currentUser.userId}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-[#18221f]/15 bg-white px-3 py-2 text-sm text-[#53615a]">
              <Bell className="h-4 w-4" aria-hidden="true" />
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
              className="min-h-11 flex-1 rounded-md border border-[#18221f]/20 bg-white px-4 py-2 text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
              placeholder="申請するユーザーID"
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]+"
            />
            <button
              type="submit"
              disabled={sendRequest.isPending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 py-2 font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37] disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {sendRequest.isPending ? "送信中..." : "申請"}
            </button>
          </form>

          {message && (
            <p className="mt-3 rounded-md border border-[#18221f]/10 bg-white px-3 py-2 text-sm text-[#53615a]">
              {message}
            </p>
          )}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-5">
            <h3 className="mb-3 text-base font-semibold">届いた申請</h3>
            {data.incomingRequests.length > 0 ? (
              <div className="space-y-3">
                {data.incomingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#18221f]/10 bg-white px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">
                        {request.sender.name ?? request.sender.userId}
                      </p>
                      <p className="font-mono text-sm text-[#68716b]">
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
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#e4f2dc] text-[#114744] transition hover:bg-[#d1eac6] disabled:opacity-50"
                        aria-label="承認"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          declineRequest.mutate({ requestId: request.id })
                        }
                        disabled={declineRequest.isPending}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#fff1e8] text-[#9f4122] transition hover:bg-[#ffd8c6] disabled:opacity-50"
                        aria-label="見送る"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#68716b]">未処理の申請はありません</p>
            )}
          </div>

          <div className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-5">
            <h3 className="mb-3 text-base font-semibold">申請中</h3>
            {data.outgoingRequests.length > 0 ? (
              <div className="space-y-3">
                {data.outgoingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-[#18221f]/10 bg-white px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {request.receiver.name ?? request.receiver.userId}
                      </p>
                      <p className="truncate font-mono text-sm text-[#68716b]">
                        {request.receiver.userId}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        cancelRequest.mutate({ requestId: request.id })
                      }
                      disabled={cancelRequest.isPending}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#fff1e8] text-[#9f4122] transition hover:bg-[#ffd8c6] disabled:opacity-50"
                      aria-label="フレンド申請を取り消す"
                      title="フレンド申請を取り消す"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#68716b]">送信中の申請はありません</p>
            )}
          </div>
        </div>

        <div className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-5">
          <h3 className="mb-3 text-base font-semibold">フレンド一覧</h3>
          {data.friends.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.friends.map((friendship) => (
                <div
                  key={friendship.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-[#18221f]/10 bg-white px-4 py-3"
                >
                  <UserProfileDialog userId={friendship.friend.userId}>
                    <button
                      type="button"
                      className="flex min-h-11 min-w-0 items-center gap-3 text-left transition hover:text-[#114744] focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:outline-none"
                      aria-label={`${friendship.friend.name ?? friendship.friend.userId}のプロフィールを開く`}
                    >
                      <UserPlus className="h-4 w-4 shrink-0 text-[#cc5f2f]" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {friendship.friend.name ?? friendship.friend.userId}
                        </span>
                        <span className="block truncate font-mono text-sm text-[#68716b]">
                          {friendship.friend.userId}
                        </span>
                      </span>
                    </button>
                  </UserProfileDialog>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm("このユーザーをブロックしますか？")) {
                        return;
                      }
                      blockUser.mutate({ userId: friendship.friend.userId });
                    }}
                    disabled={blockUser.isPending}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#fff1e8] text-[#9f4122] transition hover:bg-[#ffd8c6] disabled:opacity-50"
                    aria-label="ブロック"
                    title="ブロック"
                  >
                    <Ban className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#68716b]">
              まだフレンドはいません。ユーザーIDで申請してみましょう。
            </p>
          )}
        </div>

        <div className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-5">
          <h3 className="mb-3 text-base font-semibold">ブロック中</h3>
          {data.blockedUsers.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.blockedUsers.map((block) => (
                <div
                  key={block.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-[#18221f]/10 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {block.blocked.name ?? block.blocked.userId}
                    </p>
                    <p className="truncate font-mono text-sm text-[#68716b]">
                      {block.blocked.userId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      unblockUser.mutate({ userId: block.blocked.userId })
                    }
                    disabled={unblockUser.isPending}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#e4f2dc] text-[#114744] transition hover:bg-[#d1eac6] disabled:opacity-50"
                    aria-label="ブロック解除"
                    title="ブロック解除"
                  >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#68716b]">
              ブロック中のユーザーはいません
            </p>
          )}
        </div>
      </div>

      <aside className="rounded-md border border-[#18221f]/15 bg-[#f1e4d0] p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">通知</h3>
          <button
            type="button"
            onClick={() => markNotificationsRead.mutate()}
            disabled={
              data.unreadNotificationCount === 0 ||
              markNotificationsRead.isPending
            }
            className="rounded-md border border-[#18221f]/20 bg-[#fff8ed] px-3 py-2 text-sm font-semibold text-[#53615a] transition hover:border-[#18221f]/45 disabled:opacity-50"
          >
            既読にする
          </button>
        </div>
        {data.notifications.length > 0 ? (
          <div className="space-y-2">
            {data.notifications.map((notification) => (
              <div
                key={notification.id}
                className="rounded-md border border-[#18221f]/10 bg-[#fff8ed] px-3 py-3 text-sm"
              >
                <div className="flex items-start gap-2">
                  {!notification.readAt && (
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-[#cc5f2f]" />
                  )}
                  <p className="leading-6 text-[#53615a]">
                    {notification.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-[#18221f]/10 bg-[#fff8ed] p-4 text-sm text-[#68716b]">
            <Inbox className="mb-3 h-5 w-5 text-[#cc5f2f]" />
            通知はありません
          </div>
        )}
      </aside>
    </section>
  );
}
