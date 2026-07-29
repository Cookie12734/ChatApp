import { redirect } from "next/navigation";

import { auth } from "~/features/auth";

type ServersPageProps = {
  searchParams: Promise<{ serverId?: string }>;
};

export default async function ServersPage({ searchParams }: ServersPageProps) {
  const [session, { serverId }] = await Promise.all([auth(), searchParams]);
  const callbackUrl = serverId
    ? `/servers?serverId=${encodeURIComponent(serverId)}`
    : "/servers";

  if (!session?.user?.id) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  redirect(serverId ? `/?serverId=${encodeURIComponent(serverId)}` : "/");
}
