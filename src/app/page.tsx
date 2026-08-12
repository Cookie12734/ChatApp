import { redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { FriendChatPanel } from "~/features/chat/components/friend-chat-panel";

type HomePageProps = {
  searchParams: Promise<{ search?: string; serverId?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const [session, { search, serverId }] = await Promise.all([
    auth(),
    searchParams,
  ]);
  const callbackUrl = serverId
    ? `/?serverId=${encodeURIComponent(serverId)}`
    : "/";

  if (!session?.user?.id) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return (
    <FriendChatPanel
      initialSearchOpen={search === "1"}
      initialServerId={serverId}
    />
  );
}
