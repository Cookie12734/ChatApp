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
    <main className="min-h-dvh bg-[#f6f0e4] px-5 py-10 text-[#18221f]">
      <section className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold">通報管理</h1>
        <p className="mt-2 text-sm text-[#53615a]">
          未確認の通報を優先して、内容と緊急性を確認してください。
        </p>

        <div className="mt-7 space-y-4">
          {reports.map((report) => (
            <article
              key={report.id}
              className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold">
                  {reasonLabels[report.reason]} ・{" "}
                  {report.messageKind === "DIRECT"
                    ? "ダイレクトメッセージ"
                    : "サーバーメッセージ"}
                </p>
                <span className="text-xs font-semibold text-[#53615a]">
                  {report.status === "OPEN" ? "未確認" : "確認済み"}
                </span>
              </div>
              <p className="mt-3 rounded-md bg-[#f6f0e4] p-3 leading-7 break-words whitespace-pre-wrap">
                {report.contentSnapshot}
              </p>
              {report.details && (
                <p className="mt-3 text-sm leading-6">補足: {report.details}</p>
              )}
              <dl className="mt-3 grid gap-1 text-xs text-[#53615a] sm:grid-cols-2">
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
                    className="min-h-10 rounded-md bg-[#114744] px-4 text-sm font-semibold text-white hover:bg-[#0d3936]"
                  >
                    確認済みにする
                  </button>
                </form>
              )}
            </article>
          ))}
          {reports.length === 0 && (
            <p className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-6 text-[#53615a]">
              通報はありません。
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
