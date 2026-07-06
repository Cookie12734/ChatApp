import { redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { ServerCreate } from "~/features/server/components/server-create";

export default async function NewServerPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  return <ServerCreate />;
}
