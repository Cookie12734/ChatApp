"use client";

import {
  Ban,
  Bell,
  Check,
  Inbox,
  Send,
  Undo2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { useState } from "react";

import { ChatQueryError } from "~/features/chat/components/chat-query-error";
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
    refetchInterval: (query) =>
      query.state.status === "error" ? false : 15000,
  });

  const invalidateOverview = async () => {
    await Promise.all([
      utils.chat.getFriends.invalidate(),
      utils.friend.getOverview.invalidate(),
    ]);
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
  const removeFriend = api.friend.removeFriend.useMutation({
    onSuccess: async () => {
      setMessage("フレンドを解除しました。過去のDMはDM一覧から確認できます");
      await invalidateOverview();
    },
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
      <div className="border-connect-ink/15 bg-connect-surface text-connect-neutral w-full rounded-md border p-6 text-sm">
        読み込み中...
      </div>
    );
  }

  if (overview.error) {
    return <ChatQueryError onRetry={async () => overview.refetch()} />;
  }

  const data = overview.data;
  if (!data) return null;

  return (
    <section className="grid w-full gap-6 text-left lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border-connect-ink/15 bg-connect-surface overflow-hidden rounded-md border">
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">フレンド</h2>
              <p className="text-connect-neutral mt-1 text-sm">
                あなたのユーザーID:{" "}
                <span className="text-connect-ink font-mono">
                  {data.currentUser.userId}
                </span>
              </p>
            </div>
            <div className="border-connect-ink/15 bg-connect-surface text-connect-muted flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
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
              className="border-connect-ink/20 bg-connect-surface text-connect-ink placeholder:text-connect-placeholder focus:border-connect-action focus:ring-connect-focus-soft min-h-11 flex-1 rounded-md border px-4 py-2 focus:ring-2 focus:outline-none"
              placeholder="申請するユーザーID"
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]+"
            />
            <button
              type="submit"
              disabled={sendRequest.isPending}
              className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold transition disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {sendRequest.isPending ? "送信中..." : "申請"}
            </button>
          </form>

          {message && (
            <p className="border-connect-ink/10 bg-connect-surface text-connect-muted mt-3 rounded-md border px-3 py-2 text-sm">
              {message}
            </p>
          )}
        </div>

        <div className="border-connect-ink/15 xl:divide-connect-ink/15 grid border-t xl:grid-cols-2 xl:divide-x">
          <div className="p-5 sm:p-6">
            <h3 className="mb-3 text-base font-semibold">届いた申請</h3>
            {data.incomingRequests.length > 0 ? (
              <div className="divide-connect-ink/10 divide-y">
                {data.incomingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">
                        {request.sender.name ?? request.sender.userId}
                      </p>
                      <p className="text-connect-neutral font-mono text-sm">
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
                        className="bg-connect-highlight text-connect-action hover:bg-connect-positive-hover inline-flex h-10 w-10 items-center justify-center rounded-md transition disabled:opacity-50"
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
                        className="bg-connect-danger-soft text-connect-danger hover:bg-connect-danger-hover inline-flex h-10 w-10 items-center justify-center rounded-md transition disabled:opacity-50"
                        aria-label="見送る"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-connect-neutral text-sm">
                未処理の申請はありません
              </p>
            )}
          </div>

          <div className="border-connect-ink/15 border-t p-5 sm:p-6 xl:border-t-0">
            <h3 className="mb-3 text-base font-semibold">申請中</h3>
            {data.outgoingRequests.length > 0 ? (
              <div className="divide-connect-ink/10 divide-y">
                {data.outgoingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {request.receiver.name ?? request.receiver.userId}
                      </p>
                      <p className="text-connect-neutral truncate font-mono text-sm">
                        {request.receiver.userId}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        cancelRequest.mutate({ requestId: request.id })
                      }
                      disabled={cancelRequest.isPending}
                      className="bg-connect-danger-soft text-connect-danger hover:bg-connect-danger-hover inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition disabled:opacity-50"
                      aria-label="フレンド申請を取り消す"
                      title="フレンド申請を取り消す"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-connect-neutral text-sm">
                送信中の申請はありません
              </p>
            )}
          </div>
        </div>

        <div className="border-connect-ink/15 border-t p-5 sm:p-6">
          <h3 className="mb-3 text-base font-semibold">フレンド一覧</h3>
          {data.friends.length > 0 ? (
            <div className="divide-connect-ink/10 divide-y">
              {data.friends.map((friendship) => (
                <div
                  key={friendship.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <UserProfileDialog userId={friendship.friend.userId}>
                    <button
                      type="button"
                      className="hover:text-connect-action focus-visible:ring-connect-action flex min-h-11 min-w-0 items-center gap-3 text-left transition focus-visible:ring-2 focus-visible:outline-none"
                      aria-label={`${friendship.friend.name ?? friendship.friend.userId}のプロフィールを開く`}
                    >
                      <UserPlus className="text-connect-signal h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {friendship.friend.name ?? friendship.friend.userId}
                        </span>
                        <span className="text-connect-neutral block truncate font-mono text-sm">
                          {friendship.friend.userId}
                        </span>
                      </span>
                    </button>
                  </UserProfileDialog>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm("フレンドを解除しますか？")) return;
                        removeFriend.mutate({
                          userId: friendship.friend.userId,
                        });
                      }}
                      disabled={removeFriend.isPending}
                      className="text-connect-muted hover:bg-connect-navigation hover:text-connect-ink inline-flex h-11 w-11 items-center justify-center rounded-md transition disabled:opacity-50"
                      aria-label="フレンド解除"
                      title="フレンド解除"
                    >
                      <UserMinus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !window.confirm("このユーザーをブロックしますか？")
                        ) {
                          return;
                        }
                        blockUser.mutate({
                          userId: friendship.friend.userId,
                        });
                      }}
                      disabled={blockUser.isPending}
                      className="bg-connect-danger-soft text-connect-danger hover:bg-connect-danger-hover inline-flex h-11 w-11 items-center justify-center rounded-md transition disabled:opacity-50"
                      aria-label="ブロック"
                      title="ブロック"
                    >
                      <Ban className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-connect-neutral text-sm">
              まだフレンドはいません。ユーザーIDで申請してみましょう。
            </p>
          )}
        </div>

        <div className="border-connect-ink/15 border-t p-5 sm:p-6">
          <h3 className="mb-3 text-base font-semibold">ブロック中</h3>
          {data.blockedUsers.length > 0 ? (
            <div className="divide-connect-ink/10 divide-y">
              {data.blockedUsers.map((block) => (
                <div
                  key={block.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {block.blocked.name ?? block.blocked.userId}
                    </p>
                    <p className="text-connect-neutral truncate font-mono text-sm">
                      {block.blocked.userId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      unblockUser.mutate({ userId: block.blocked.userId })
                    }
                    disabled={unblockUser.isPending}
                    className="bg-connect-highlight text-connect-action hover:bg-connect-positive-hover inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition disabled:opacity-50"
                    aria-label="ブロック解除"
                    title="ブロック解除"
                  >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-connect-neutral text-sm">
              ブロック中のユーザーはいません
            </p>
          )}
        </div>
      </div>

      <aside className="border-connect-ink/15 bg-connect-navigation rounded-md border p-5 lg:sticky lg:top-0 lg:self-start">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">通知</h3>
          <button
            type="button"
            onClick={() => markNotificationsRead.mutate()}
            disabled={
              data.unreadNotificationCount === 0 ||
              markNotificationsRead.isPending
            }
            className="border-connect-ink/20 bg-connect-surface text-connect-muted hover:border-connect-ink/45 rounded-md border px-3 py-2 text-sm font-semibold transition disabled:opacity-50"
          >
            既読にする
          </button>
        </div>
        {data.notifications.length > 0 ? (
          <div className="divide-connect-ink/10 divide-y">
            {data.notifications.map((notification) => (
              <div
                key={notification.id}
                className="py-3 text-sm first:pt-0 last:pb-0"
              >
                <div className="flex items-start gap-2">
                  {!notification.readAt && (
                    <span className="bg-connect-signal mt-1.5 h-2 w-2 rounded-full" />
                  )}
                  <p className="text-connect-muted leading-6">
                    {notification.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-connect-neutral py-4 text-sm">
            <Inbox className="text-connect-signal mb-3 h-5 w-5" />
            通知はありません
          </div>
        )}
      </aside>
    </section>
  );
}
