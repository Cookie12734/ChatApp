import { redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { ServerSelection } from "~/features/server/components/server-selection";
import { db } from "~/server/db";

export default async function ServersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, image: true },
  });

  return <ServerSelection userName={user?.name} userImage={user?.image} />;
}
