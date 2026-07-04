import { redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { FriendChatPanel } from "~/features/chat/components/friend-chat-panel";

type HomePageProps = {
  searchParams: Promise<{ serverId?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  const { serverId } = await searchParams;

  return <FriendChatPanel initialServerId={serverId} />;
}
