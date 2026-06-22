import { redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { FriendChatPanel } from "~/features/chat/components/friend-chat-panel";

export default async function ChatsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  return <FriendChatPanel />;
}
