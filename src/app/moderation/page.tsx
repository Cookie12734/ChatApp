import { notFound, redirect } from "next/navigation";

import { auth } from "~/features/auth";
import { isModerator } from "~/features/moderation/server/permissions";
import { db } from "~/server/db";

import { markReportReviewed } from "./actions";

const reasonLabels = {
  HARASSMENT: "嫌がらせ",
  OTHER: "その他",
  SELF_HARM: "自傷・自殺のおそれ",
  SPAM: "スパム",
} as const;

export default async function ModerationPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/auth/login?callbackUrl=%2Fmoderation");
  if (!(await isModerator(userId))) notFound();

  const reports = await db.messageReport.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      reporter: { select: { name: true, userId: true } },
      reportedUser: { select: { name: true, userId: true } },
    },
  });

  return (
    <main className="bg-connect-paper text-connect-ink min-h-dvh px-5 py-10">
      <section className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold">通報管理</h1>
        <p className="text-connect-muted mt-2 text-sm">
          未確認の通報を優先して、内容と緊急性を確認してください。
        </p>

        <div className="mt-7 space-y-4">
          {reports.map((report) => (
            <article
              key={report.id}
              className="border-connect-ink/15 bg-connect-surface rounded-md border p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold">
                  {reasonLabels[report.reason]} ・{" "}
                  {report.messageKind === "DIRECT"
                    ? "ダイレクトメッセージ"
                    : "サーバーメッセージ"}
                </p>
                <span className="text-connect-muted text-xs font-semibold">
                  {report.status === "OPEN" ? "未確認" : "確認済み"}
                </span>
              </div>
              <p className="bg-connect-paper mt-3 rounded-md p-3 leading-7 break-words whitespace-pre-wrap">
                {report.contentSnapshot}
              </p>
              {report.details && (
                <p className="mt-3 text-sm leading-6">補足: {report.details}</p>
              )}
              <dl className="text-connect-muted mt-3 grid gap-1 text-xs sm:grid-cols-2">
                <div>
                  <dt className="inline font-semibold">対象: </dt>
                  <dd className="inline">
                    {report.reportedUser?.name ??
                      report.reportedUser?.userId ??
                      "削除済みユーザー"}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold">通報者: </dt>
                  <dd className="inline">
                    {report.reporter?.name ??
                      report.reporter?.userId ??
                      "削除済みユーザー"}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold">日時: </dt>
                  <dd className="inline">
                    {new Intl.DateTimeFormat("ja-JP", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(report.createdAt)}
                  </dd>
                </div>
                {report.serverId && (
                  <div>
                    <dt className="inline font-semibold">サーバーID: </dt>
                    <dd className="inline">{report.serverId}</dd>
                  </div>
                )}
              </dl>
              {report.status === "OPEN" && (
                <form action={markReportReviewed} className="mt-4">
                  <input type="hidden" name="reportId" value={report.id} />
                  <button
                    type="submit"
                    className="bg-connect-action text-connect-surface hover:bg-connect-action-hover min-h-10 rounded-md px-4 text-sm font-semibold"
                  >
                    確認済みにする
                  </button>
                </form>
              )}
            </article>
          ))}
          {reports.length === 0 && (
            <p className="border-connect-ink/15 bg-connect-surface text-connect-muted rounded-md border p-6">
              通報はありません。
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
