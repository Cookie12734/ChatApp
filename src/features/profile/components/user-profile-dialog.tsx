"use client";

import { Settings, UserCheck, UserMinus, UserPlus, X } from "lucide-react";
import { type ReactNode, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { ProfileSettingsDialog } from "~/features/profile/components/profile-settings-dialog";
import { ServerProfileSettingsDialog } from "~/features/profile/components/server-profile-settings-dialog";
import {
  getPresenceDisplayLabel,
  getPresenceDotClassName,
} from "~/features/profile/presence";
import { api } from "~/trpc/react";

type UserProfileDialogProps = {
  children?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  serverId?: string;
  userId: string;
};

export function UserProfileDialog({
  children,
  onOpenChange,
  open: controlledOpen,
  serverId,
  userId,
}: UserProfileDialogProps) {
  const utils = api.useUtils();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const profile = api.profile.getByUserId.useQuery(
    { serverId, userId },
    { enabled: isOpen },
  );
  const invalidateProfile = async () => {
    await Promise.all([
      utils.chat.getFriends.invalidate(),
      utils.friend.getOverview.invalidate(),
      utils.profile.getByUserId.invalidate(),
    ]);
  };
  const sendFriendRequest = api.friend.sendRequest.useMutation({
    onSuccess: invalidateProfile,
  });
  const acceptFriendRequest = api.friend.acceptRequest.useMutation({
    onSuccess: invalidateProfile,
  });
  const cancelFriendRequest = api.friend.cancelRequest.useMutation({
    onSuccess: invalidateProfile,
  });
  const removeFriend = api.friend.removeFriend.useMutation({
    onSuccess: invalidateProfile,
  });
  const data = profile.data;
  const displayName =
    data?.serverProfile?.nickname?.trim() ??
    data?.name?.trim() ??
    data?.userId ??
    "";
  const displayedBio = data?.serverProfile?.bio ?? data?.bio;
  const friendActionError =
    sendFriendRequest.error?.message ??
    acceptFriendRequest.error?.message ??
    cancelFriendRequest.error?.message ??
    removeFriend.error?.message;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setInternalOpen(open);
        onOpenChange?.(open);
        if (!open) {
          sendFriendRequest.reset();
          acceptFriendRequest.reset();
          cancelFriendRequest.reset();
          removeFriend.reset();
        }
      }}
    >
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="bg-connect-paper text-connect-ink max-h-[92dvh] overflow-x-hidden overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="border-connect-ink/15 border-b px-5 py-4">
          <DialogTitle>プロフィール</DialogTitle>
          <DialogDescription className="sr-only">
            ユーザーのプロフィール詳細
          </DialogDescription>
        </DialogHeader>

        <div className="p-5">
          {profile.isLoading && (
            <div
              className="border-connect-ink/15 bg-connect-surface space-y-5 rounded-md border p-5"
              aria-label="プロフィールを読み込み中"
            >
              <div className="flex items-center gap-4">
                <div className="bg-connect-navigation h-20 w-20 animate-pulse rounded-md" />
                <div className="flex-1 space-y-2">
                  <div className="bg-connect-navigation h-6 w-40 max-w-full animate-pulse rounded" />
                  <div className="bg-connect-navigation h-4 w-28 animate-pulse rounded" />
                </div>
              </div>
              <div className="bg-connect-navigation h-20 animate-pulse rounded-md" />
            </div>
          )}

          {profile.error && (
            <div
              className="border-connect-signal/25 bg-connect-danger-soft text-connect-danger rounded-md border p-5 text-sm"
              role="alert"
            >
              <p>プロフィールを表示できませんでした。</p>
              <button
                type="button"
                onClick={() => void profile.refetch()}
                className="border-connect-danger/30 bg-connect-surface hover:bg-connect-danger-hover focus-visible:ring-connect-danger mt-3 min-h-11 rounded-md border px-4 font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
              >
                もう一度試す
              </button>
            </div>
          )}

          {data && (
            <section className="border-connect-ink/15 bg-connect-surface rounded-md border p-5 shadow-[8px_8px_0_var(--color-focus-on-dark)]">
              {data.serverProfile && (
                <p className="text-connect-danger mb-3 text-xs font-semibold tracking-wide uppercase">
                  サーバープロフィール
                </p>
              )}
              <div className="flex items-center gap-4">
                {data.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.image}
                    alt=""
                    className="border-connect-ink/15 h-20 w-20 shrink-0 rounded-md border object-cover sm:h-24 sm:w-24"
                  />
                ) : (
                  <span className="bg-connect-ink text-connect-paper flex h-20 w-20 shrink-0 items-center justify-center rounded-md text-2xl font-semibold sm:h-24 sm:w-24 sm:text-3xl">
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold sm:text-3xl">
                    {displayName}
                  </h2>
                  <p className="text-connect-neutral truncate font-mono text-sm">
                    @{data.userId}
                  </p>
                  <p className="text-connect-neutral mt-2 inline-flex items-center gap-1.5 text-sm">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${getPresenceDotClassName(
                        data.presenceStatus,
                      )}`}
                      aria-hidden="true"
                    />
                    {getPresenceDisplayLabel(data.presenceStatus)}
                  </p>
                </div>
              </div>

              {data.statusMessage && (
                <p className="border-connect-ink/10 bg-connect-surface text-connect-muted mt-5 rounded-md border px-3 py-2 text-sm">
                  {data.statusMessage}
                </p>
              )}

              <div className="border-connect-ink/10 bg-connect-surface text-connect-muted mt-5 rounded-md border p-4 leading-7">
                {displayedBio ?? "自己紹介は未設定です"}
              </div>

              {data.relationship === "SELF" ? (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {data.serverProfile && (
                    <ServerProfileSettingsDialog
                      serverId={data.serverProfile.serverId}
                      initialBio={data.serverProfile.bio}
                      initialNickname={data.serverProfile.nickname}
                    >
                      <button
                        type="button"
                        className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 focus-visible:ring-connect-action inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                      >
                        <Settings className="h-4 w-4" aria-hidden="true" />
                        サーバープロフィールを編集
                      </button>
                    </ServerProfileSettingsDialog>
                  )}
                  <ProfileSettingsDialog>
                    <button
                      type="button"
                      className="border-connect-ink/20 bg-connect-surface text-connect-ink hover:bg-connect-navigation focus-visible:ring-connect-action inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <Settings className="h-4 w-4" aria-hidden="true" />
                      全体のプロフィールを編集
                    </button>
                  </ProfileSettingsDialog>
                </div>
              ) : (
                <div className="mt-5">
                  {data.relationship === "NONE" && (
                    <button
                      type="button"
                      onClick={() => sendFriendRequest.mutate({ userId })}
                      disabled={sendFriendRequest.isPending}
                      className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 focus-visible:ring-connect-action inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-50"
                    >
                      <UserPlus className="h-4 w-4" aria-hidden="true" />
                      {sendFriendRequest.isPending
                        ? "申請を送信中..."
                        : "フレンド追加"}
                    </button>
                  )}
                  {data.relationship === "INCOMING_PENDING" &&
                    data.incomingRequestId && (
                      <button
                        type="button"
                        onClick={() =>
                          acceptFriendRequest.mutate({
                            requestId: data.incomingRequestId!,
                          })
                        }
                        disabled={acceptFriendRequest.isPending}
                        className="bg-connect-action text-connect-surface hover:bg-connect-action-hover focus-visible:ring-connect-action inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-50"
                      >
                        <UserCheck className="h-4 w-4" aria-hidden="true" />
                        {acceptFriendRequest.isPending
                          ? "承認中..."
                          : "フレンドになる"}
                      </button>
                    )}
                  {data.relationship === "OUTGOING_PENDING" &&
                    data.outgoingRequestId && (
                      <button
                        type="button"
                        onClick={() =>
                          cancelFriendRequest.mutate({
                            requestId: data.outgoingRequestId!,
                          })
                        }
                        disabled={cancelFriendRequest.isPending}
                        className="border-connect-danger/25 bg-connect-danger-soft text-connect-danger hover:bg-connect-danger-hover focus-visible:ring-connect-danger inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-50"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        {cancelFriendRequest.isPending
                          ? "取消中..."
                          : "フレンド申請を取り消す"}
                      </button>
                    )}
                  {data.relationship === "FRIENDS" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm("フレンドを解除しますか？")) return;
                        removeFriend.mutate({ userId });
                      }}
                      disabled={removeFriend.isPending}
                      className="border-connect-danger/25 bg-connect-danger-soft text-connect-danger hover:bg-connect-danger-hover inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-50"
                    >
                      <UserMinus className="h-4 w-4" aria-hidden="true" />
                      {removeFriend.isPending ? "解除中..." : "フレンド解除"}
                    </button>
                  )}
                  {friendActionError && (
                    <p
                      className="border-connect-signal/25 bg-connect-danger-soft text-connect-danger mt-3 rounded-md border px-3 py-2 text-sm"
                      role="alert"
                    >
                      {friendActionError}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
