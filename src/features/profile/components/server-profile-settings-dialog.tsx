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
      <DialogContent className="max-h-[92dvh] overflow-y-auto bg-[#f6f0e4] p-0 text-[#18221f] sm:max-w-lg">
        <DialogHeader className="border-b border-[#18221f]/15 px-5 py-4">
          <DialogTitle>サーバープロフィールを編集</DialogTitle>
          <DialogDescription className="text-sm text-[#68716b]">
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
            <span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-[#53615a]">
              <span>サーバー内の表示名</span>
              <span className="font-normal text-[#68716b]">
                {nickname.length}/32
              </span>
            </span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              className="min-h-11 w-full rounded-md border border-[#18221f]/20 bg-white px-4 py-2 text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
              placeholder="未設定の場合は全体の表示名を使用"
              maxLength={32}
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-[#53615a]">
              <span>サーバー内の自己紹介</span>
              <span className="font-normal text-[#68716b]">
                {bio.length}/160
              </span>
            </span>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              className="min-h-28 w-full resize-y rounded-md border border-[#18221f]/20 bg-white px-4 py-3 leading-7 text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
              placeholder="このサーバーでの自己紹介"
              maxLength={160}
            />
          </label>

          {updateServerProfile.error && (
            <p
              className="rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] px-3 py-2 text-sm text-[#9f4122]"
              role="alert"
            >
              {updateServerProfile.error.message}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="min-h-11 rounded-md border border-[#18221f]/15 bg-white px-4 text-sm font-semibold text-[#53615a] transition hover:bg-[#f1e4d0] focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:outline-none"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={updateServerProfile.isPending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 text-sm font-semibold text-[#f6f0e4] transition hover:bg-[#2f3c37] focus-visible:ring-2 focus-visible:ring-[#114744] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-50"
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
