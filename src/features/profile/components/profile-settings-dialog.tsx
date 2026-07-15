"use client";

import { type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { ProfileForm } from "~/features/profile/components/profile-form";

export function ProfileSettingsDialog({ children }: { children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto bg-[#f6f0e4] p-0 text-[#18221f] sm:max-w-5xl">
        <DialogHeader className="border-b border-[#18221f]/15 px-5 py-4">
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
