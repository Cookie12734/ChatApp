"use client";

import { type ReactNode } from "react";
import dynamic from "next/dynamic";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

const ProfileForm = dynamic(
  () =>
    import("~/features/profile/components/profile-form").then(
      (module) => module.ProfileForm,
    ),
  { loading: () => <p role="status">プロフィール設定を読み込み中…</p> },
);

export function ProfileSettingsDialog({
  children,
  onOpenChange,
  open,
}: {
  children?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="bg-connect-paper text-connect-ink max-h-[92dvh] overflow-y-auto p-0 sm:max-w-5xl">
        <DialogHeader className="border-connect-ink/15 border-b px-5 py-4">
          <DialogTitle>プロフィール設定</DialogTitle>
          <DialogDescription className="sr-only">
            プロフィール画像、表示名、自己紹介、ステータスを編集します。
          </DialogDescription>
        </DialogHeader>
        <div className="p-5">
          <ProfileForm />
        </div>
      </DialogContent>
    </Dialog>
  );
}
