import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLoading } from "@/components/app/page-loading";
import { Pill } from "@/components/brand/pill";
import { Sticker } from "@/components/brand/sticker";
import { ExcuseReview } from "@/components/report/excuse-review";
import { ReasonForm } from "@/components/report/reason-form";
import { getReportDetail, type ReportDetail } from "@/lib/report-detail";
import { formatJstDateTime, formatJstDay } from "@/lib/time";

export const metadata: Metadata = { title: "理由申告 | Commit or Treat" };

const CATEGORY: Record<string, string> = {
  unrealistic: "宣言が妥当じゃなかった",
  slacked: "サボった",
  sudden_plan: "急遽予定ができた",
  other: "その他",
  not_reported: "申告しなかった（サボり扱い）",
};

const STATUS: Record<string, string> = {
  awaiting_report: "申告待ち",
  under_review: "審査中",
  resolved: "決着",
};

export default function ReportPage({ params }: PageProps<"/reports/[logId]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: Pick<PageProps<"/reports/[logId]">, "params">) {
  const { logId } = await params;
  const detail = /^[0-9a-f-]{36}$/.test(logId) ? await getReportDetail(logId) : null;
  if (!detail) notFound();
  const { log, owner, report, can } = detail;

  if (can.report) {
    return (
      <ReasonForm
        logId={log.id}
        deadline={report.dueAt}
        goal={log.declaration ?? ""}
        minChars={detail.minChars}
        unrealisticStreak={detail.streakBefore}
        amounts={detail.amounts}
      />
    );
  }

  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <p className="m-0 text-sm font-bold text-sub">{formatJstDay(log.date)}</p>
        <div className="flex items-center justify-between gap-2">
          <h1 className="m-0 font-heading text-[1.4rem] leading-tight font-normal">{owner.name} さんの理由申告</h1>
          <Pill variant="outline">{STATUS[report.status] ?? report.status}</Pill>
        </div>
      </header>

      <Sticker className="grid gap-2 px-4 py-4">
        <small className="text-xs text-sub">宣言（締切 {log.targetEndTime ? formatJstDateTime(log.targetEndTime) : ""}）</small>
        <p className="m-0 font-bold whitespace-pre-wrap">{log.declaration}</p>
      </Sticker>

      <ReportBody detail={detail} />

      {can.review ? (
        <Sticker tone="tape" className="grid gap-3 px-4 py-4">
          <b>この理由に納得できますか？</b>
          <span className="text-sm font-medium">
            {report.reviewDueAt ? formatJstDateTime(report.reviewDueAt) : ""} までに全員が「納得」を押したら 0 円。
          </span>
          <ExcuseReview logId={log.id} />
        </Sticker>
      ) : null}

      <Link href={`/logs/${log.id}`} className="text-sm font-bold underline underline-offset-2">
        その日の記録を見る →
      </Link>
    </div>
  );
}

function ReportBody({ detail }: { detail: ReportDetail }) {
  const { report, reviews } = detail;
  if (report.status === "awaiting_report") {
    return (
      <Sticker className="grid gap-1 px-4 py-3">
        <b>まだ申告していません</b>
        <span className="text-sm font-medium">{formatJstDateTime(report.dueAt)} までに申告がなければ、サボり扱いになります。</span>
      </Sticker>
    );
  }

  return (
    <Sticker className="grid gap-2 px-4 py-4">
      <b>{CATEGORY[report.category ?? ""] ?? report.category}</b>
      {report.nextPlanText ? (
        <p className="m-0 text-sm whitespace-pre-wrap">
          <b>次の計画:</b> {report.nextPlanText}
        </p>
      ) : null}
      {report.reasonText ? <p className="m-0 text-sm whitespace-pre-wrap">{report.reasonText}</p> : null}
      {report.streak ? <p className="m-0 text-xs text-sub">{report.streak} 回連続</p> : null}
      {reviews.length > 0 ? (
        <ul className="m-0 grid list-none gap-1 p-0 text-xs">
          {reviews.map((review) => (
            <li key={review.reviewerId}>
              {review.name}: {review.verdict === "accept" ? "納得" : review.verdict === "reject" ? "納得できない" : "まだ"}
              {review.comment ? `（${review.comment}）` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {report.status === "resolved" ? (
        <p className="m-0 text-sm font-bold">
          {report.outcome === "no_penalty"
            ? "結果: ペナルティなし"
            : `結果: ${detail.waived ? "お試し期間なので本番なら " : ""}${(detail.points ?? 0).toLocaleString()} 円`}
        </p>
      ) : null}
    </Sticker>
  );
}
