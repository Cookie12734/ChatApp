"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "~/features/auth";
import { isModerator } from "~/features/moderation/server/permissions";
import { db } from "~/server/db";

export async function markReportReviewed(formData: FormData) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || !(await isModerator(userId))) notFound();

  const reportId = formData.get("reportId");
  if (typeof reportId !== "string" || !reportId) return;

  await db.messageReport.updateMany({
    where: { id: reportId },
    data: {
      reviewedAt: new Date(),
      reviewedById: userId,
      status: "REVIEWED",
    },
  });
  revalidatePath("/moderation");
}
