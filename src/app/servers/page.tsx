import { redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { ServerSelection } from "~/features/server/components/server-selection";

type ServersPageProps = {
  searchParams: Promise<{ serverId?: string }>;
};

export default async function ServersPage({ searchParams }: ServersPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  const { serverId } = await searchParams;

  return (
    <ServerSelection initialServerId={serverId} userName={session.user.name} />
  );
}
