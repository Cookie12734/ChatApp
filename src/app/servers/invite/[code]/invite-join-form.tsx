"use client";

import { LogIn } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "~/components/ui/button";

function JoinButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 min-h-12 w-full px-5 motion-reduce:transition-none"
    >
      <LogIn aria-hidden="true" />
      {pending ? "参加しています..." : "サーバーに参加する"}
    </Button>
  );
}

export function InviteJoinForm({
  joinAction,
}: {
  joinAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={joinAction}>
      <JoinButton />
    </form>
  );
}
