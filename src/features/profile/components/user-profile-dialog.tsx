"use client";

import { Clock3, Settings, UserCheck, UserPlus } from "lucide-react";
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
  children: ReactNode;
  serverId?: string;
  userId: string;
};

export function UserProfileDialog({
  children,
  serverId,
  userId,
}: UserProfileDialogProps) {
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const profile = api.profile.getByUserId.useQuery(
    { serverId, userId },
    { enabled: isOpen },
  );
  const invalidateProfile = async () => {
    await Promise.all([
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
  const data = profile.data;
  const displayName =
    data?.serverProfile?.nickname?.trim() ??
    data?.name?.trim() ??
    data?.userId ??
    "";
  const displayedBio = data?.serverProfile?.bio ?? data?.bio;
  const friendActionError =
    sendFriendRequest.error?.message ?? acceptFriendRequest.error?.message;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          sendFriendRequest.reset();
          acceptFriendRequest.reset();
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-x-hidden overflow-y-auto bg-[#f6f0e4] p-0 text-[#18221f] sm:max-w-xl">
        <DialogHeader className="border-b border-[#18221f]/15 px-5 py-4">
          <DialogTitle>プロフィール</DialogTitle>
          <DialogDescription className="sr-only">
            ユーザーのプロフィール詳細
          </DialogDescription>
        </DialogHeader>

        <div className="p-5">
          {profile.isLoading && (
            <div
              className="space-y-5 rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-5"
              aria-label="プロフィールを読み込み中"
            >
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 animate-pulse rounded-md bg-[#f1e4d0]" />
                <div className="flex-1 space-y-2">
                  <div className="h-6 w-40 max-w-full animate-pulse rounded bg-[#f1e4d0]" />
                  <div className="h-4 w-28 animate-pulse rounded bg-[#f1e4d0]" />
                </div>
              </div>
              <div className="h-20 animate-pulse rounded-md bg-[#f1e4d0]" />
            </div>
          )}

          {profile.error && (
            <div
              className="rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] p-5 text-sm text-[#9f4122]"
              role="alert"
            >
              <p>プロフィールを表示できませんでした。</p>
              <button
                type="button"
                onClick={() => void profile.refetch()}
                className="mt-3 min-h-11 rounded-md border border-[#9f4122]/30 bg-white px-4 font-semibold transition hover:bg-[#ffd8c6] focus-visible:ring-2 focus-visible:ring-[#9f4122] focus-visible:outline-none"
              >
                もう一度試す
              </button>
            </div>
          )}

          {data && (
            <section className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-5 shadow-[8px_8px_0_#d8efee]">
              {data.serverProfile && (
                <p className="mb-3 text-xs font-semibold tracking-wide text-[#9f4122] uppercase">
                  サーバープロフィール
                </p>
              )}
              <div className="flex items-center gap-4">
                {data.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.image}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-md border border-[#18221f]/15 object-cover sm:h-24 sm:w-24"
                  />
                ) : (
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-[#18221f] text-2xl font-semibold text-[#f6f0e4] sm:h-24 sm:w-24 sm:text-3xl">
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold sm:text-3xl">
                    {displayName}
                  </h2>
                  <p className="truncate font-mono text-sm text-[#68716b]">
                    @{data.userId}
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[#68716b]">
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
                <p className="mt-5 rounded-md border border-[#18221f]/10 bg-white px-3 py-2 text-sm text-[#53615a]">
                  {data.statusMessage}
                </p>
              )}

              <div className="mt-5 rounded-md border border-[#18221f]/10 bg-white p-4 leading-7 text-[#53615a]">
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
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 text-sm font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37] focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:ring-offset-2 focus-visible:outline-none"
                      >
                        <Settings className="h-4 w-4" aria-hidden="true" />
                        サーバープロフィールを編集
                      </button>
                    </ServerProfileSettingsDialog>
                  )}
                  <ProfileSettingsDialog>
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#18221f]/20 bg-white px-4 text-sm font-semibold text-[#18221f] transition hover:bg-[#f1e4d0] focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:outline-none"
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
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 text-sm font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37] focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-50"
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
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#114744] px-4 text-sm font-semibold text-white transition hover:bg-[#0d3936] focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-50"
                      >
                        <UserCheck className="h-4 w-4" aria-hidden="true" />
                        {acceptFriendRequest.isPending
                          ? "承認中..."
                          : "フレンドになる"}
                      </button>
                    )}
                  {data.relationship === "OUTGOING_PENDING" && (
                    <button
                      type="button"
                      disabled
                      className="inline-flex min-h-11 w-full cursor-default items-center justify-center gap-2 rounded-md border border-[#18221f]/15 bg-[#f1e4d0] px-4 text-sm font-semibold text-[#53615a]"
                    >
                      <Clock3 className="h-4 w-4" aria-hidden="true" />
                      フレンド申請済み
                    </button>
                  )}
                  {data.relationship === "FRIENDS" && (
                    <button
                      type="button"
                      disabled
                      className="inline-flex min-h-11 w-full cursor-default items-center justify-center gap-2 rounded-md border border-[#114744]/20 bg-[#e4f2dc] px-4 text-sm font-semibold text-[#114744]"
                    >
                      <UserCheck className="h-4 w-4" aria-hidden="true" />
                      フレンド
                    </button>
                  )}
                  {friendActionError && (
                    <p
                      className="mt-3 rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] px-3 py-2 text-sm text-[#9f4122]"
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
