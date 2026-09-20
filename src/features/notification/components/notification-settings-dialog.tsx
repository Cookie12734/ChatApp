"use client";

import { type ReactNode } from "react";
import { BellRing } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import dynamic from "next/dynamic";

const NotificationSettingsForm = dynamic(
  () =>
    import("./notification-settings-form").then(
      (module) => module.NotificationSettingsForm,
    ),
  {
    loading: () => (
      <p className="p-5" role="status">
        通知設定を読み込み中…
      </p>
    ),
  },
);

export function NotificationSettingsDialog({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="bg-connect-paper text-connect-ink max-h-[92dvh] overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="border-connect-ink/15 border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5" aria-hidden="true" />
            通知設定
          </DialogTitle>
          <DialogDescription>
            受け取りたい通知と、この端末への配信を選べます。
          </DialogDescription>
        </DialogHeader>
        <NotificationSettingsForm />
      </DialogContent>
    </Dialog>
  );
}
