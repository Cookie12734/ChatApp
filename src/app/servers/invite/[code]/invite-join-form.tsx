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
      className="min-h-12 w-full bg-[#18221f] px-5 text-[#f6f0e4] hover:bg-[#2f3c37] motion-reduce:transition-none"
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
