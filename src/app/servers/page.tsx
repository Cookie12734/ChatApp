import { redirect } from "next/navigation";

import { auth } from "~/features/auth";

type ServersPageProps = {
  searchParams: Promise<{ serverId?: string }>;
};

export default async function ServersPage({ searchParams }: ServersPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const { serverId } = await searchParams;

  redirect(serverId ? `/?serverId=${encodeURIComponent(serverId)}` : "/");
}
