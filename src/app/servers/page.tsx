import { redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { ServerSelection } from "~/features/server/components/server-selection";

export default async function ServersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  return <ServerSelection userName={session.user.name} />;
}
