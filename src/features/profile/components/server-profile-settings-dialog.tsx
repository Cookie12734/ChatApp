"use client";

import { Save } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { api } from "~/trpc/react";

type ServerProfileSettingsDialogProps = {
  children: ReactNode;
  initialBio?: string | null;
  initialNickname?: string | null;
  serverId: string;
};

export function ServerProfileSettingsDialog({
  children,
  initialBio,
  initialNickname,
  serverId,
}: ServerProfileSettingsDialogProps) {
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const [nickname, setNickname] = useState(initialNickname ?? "");
  const [bio, setBio] = useState(initialBio ?? "");

  useEffect(() => {
    if (!isOpen) return;

    setNickname(initialNickname ?? "");
    setBio(initialBio ?? "");
  }, [initialBio, initialNickname, isOpen]);

  const updateServerProfile = api.server.updateMyProfile.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.profile.getByUserId.invalidate(),
        utils.server.getConversation.invalidate(),
        utils.server.getOverview.invalidate(),
      ]);
      setIsOpen(false);
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="bg-connect-paper text-connect-ink max-h-[92dvh] overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="border-connect-ink/15 border-b px-5 py-4">
          <DialogTitle>サーバープロフィールを編集</DialogTitle>
          <DialogDescription className="text-connect-neutral text-sm">
            このサーバー内だけで使う表示名と自己紹介を設定できます。
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            updateServerProfile.mutate({ bio, nickname, serverId });
          }}
        >
          <label className="block">
            <span className="text-connect-muted mb-2 flex items-center justify-between gap-3 text-sm font-semibold">
              <span>サーバー内の表示名</span>
              <span className="text-connect-neutral font-normal">
                {nickname.length}/32
              </span>
            </span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              className="border-connect-ink/20 bg-connect-surface text-connect-ink placeholder:text-connect-placeholder min-h-11 w-full rounded-md border px-4 py-2"
              placeholder="未設定の場合は全体の表示名を使用"
              maxLength={32}
            />
          </label>

          <label className="block">
            <span className="text-connect-muted mb-2 flex items-center justify-between gap-3 text-sm font-semibold">
              <span>サーバー内の自己紹介</span>
              <span className="text-connect-neutral font-normal">
                {bio.length}/160
              </span>
            </span>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              className="border-connect-ink/20 bg-connect-surface text-connect-ink placeholder:text-connect-placeholder min-h-28 w-full resize-y rounded-md border px-4 py-3 leading-7"
              placeholder="このサーバーでの自己紹介"
              maxLength={160}
            />
          </label>

          {updateServerProfile.error && (
            <p
              className="border-connect-signal/25 bg-connect-danger-soft text-connect-danger rounded-md border px-3 py-2 text-sm"
              role="alert"
            >
              {updateServerProfile.error.message}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="border-connect-ink/15 bg-connect-surface text-connect-muted hover:bg-connect-navigation focus-visible:ring-connect-action min-h-11 rounded-md border px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={updateServerProfile.isPending}
              className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 focus-visible:ring-connect-action inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-50"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {updateServerProfile.isPending ? "保存中..." : "変更を保存"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
