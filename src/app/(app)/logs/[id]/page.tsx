import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLoading } from "@/components/app/page-loading";
import { Countdown } from "@/components/brand/countdown";
import { Pill } from "@/components/brand/pill";
import { Stamp } from "@/components/brand/stamp";
import { Sticker } from "@/components/brand/sticker";
import { PassphraseCard } from "@/components/declare/passphrase-card";
import { AppealReview } from "@/components/appeal/appeal-actions";
import { DisputeReview, WithdrawFlagButton } from "@/components/dispute/dispute-actions";
import { ResendForm } from "@/components/dispute/resend-form";
import { PageTip } from "@/components/onboarding/page-tip";
import { TermHelp } from "@/components/onboarding/term-help";
import { JudgeKarte } from "@/components/submit/judge-karte";
import { FlagForm } from "@/components/today/flag-form";
import { Timeline } from "@/components/dashboard/timeline";
import { getLogDetail, type DetailSubmission, type LogDetail } from "@/lib/log-detail";
import { createClient } from "@/lib/supabase/server";
import { getTimeline } from "@/lib/timeline";
import { TIPS } from "@/lib/tips";
import { formatJstDateTime, formatJstDay, formatJstTime } from "@/lib/time";

export const metadata: Metadata = { title: "その日の記録 | Commit or Treat" };

const STATUS: Record<string, string> = {
  pending: "進行中",
  passed: "合格（確定待ち）",
  completed: "達成",
  missed: "未達成",
  no_declaration: "宣言なし",
  invalidated: "証拠不認定",
};

/** A makeup session (補習) pays one back when completed; a failed one just doesn't count. */
const MAKEUP_STATUS: Record<string, string> = {
  completed: "返した",
  missed: "数えない",
};

const APPEAL: Record<string, string> = {
  under_review: "判定中",
  accepted: "認められた",
  rejected: "認められなかった",
  cancelled: "取りやめ",
};

const DISPUTE: Record<string, string> = {
  resending: "送り直し受付中",
  final_review: "最終審査中",
  upheld: "達成で確定",
  invalidated: "証拠不認定",
};

export default function LogPage({ params }: PageProps<"/logs/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Log params={params} />
    </Suspense>
  );
}

async function Log({ params }: Pick<PageProps<"/logs/[id]">, "params">) {
  const { id } = await params;
  const detail = /^[0-9a-f-]{36}$/.test(id) ? await getLogDetail(id) : null;
  if (!detail) notFound();
  const { log, owner, dispute, can } = detail;

  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <p className="m-0 text-sm font-bold text-sub">
          {formatJstDay(log.date)}
          {log.isMakeup ? " ・ 補習" : ""}
        </p>
        <div className="flex items-center justify-between gap-2">
          <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">
            {owner.name} さんの{log.isMakeup ? "補習" : "記録"}
          </h1>
          <span className="flex items-center gap-1.5">
            <Pill variant={log.status === "completed" ? "ink" : "outline"}>
              {(log.isMakeup ? MAKEUP_STATUS[log.status] : undefined) ?? STATUS[log.status] ?? log.status}
            </Pill>
            {log.status === "passed" && !log.isMakeup ? <TermHelp term="awaiting" /> : null}
          </span>
        </div>
      </header>

      {log.declaration ? (
        <Sticker className="grid gap-2 px-4 py-4">
          <small className="text-xs text-sub">
            宣言 {log.declaredAt ? formatJstTime(log.declaredAt) : ""} ・ 締切 {log.targetEndTime ? formatJstDateTime(log.targetEndTime) : ""}
          </small>
          <p className="m-0 font-bold whitespace-pre-wrap">{log.declaration}</p>
          {log.originalDeclaration ? (
            <p className="m-0 text-sm text-sub">
              書き直す前: <s>{log.originalDeclaration}</s>
            </p>
          ) : null}
          {detail.declarationFlags.map((flag) => (
            <p key={flag.name} className="m-0 text-sm">
              <b className="text-red">軽すぎる</b>（{flag.name}）: {flag.comment}
            </p>
          ))}
          {log.passphrase ? <PassphraseCard value={log.passphrase} compact /> : null}
        </Sticker>
      ) : null}

      {log.status === "missed" && !log.isMakeup ? (
        <Link href={`/reports/${log.id}`} className="text-sm font-bold underline underline-offset-2">
          理由申告を見る →
        </Link>
      ) : null}

      <AppealSection detail={detail} />

      <DisputeSection detail={detail} />

      {log.status === "passed" && detail.submissions.some((submission) => submission.unverified) ? (
        <Sticker tone="tape" shadow="sm" className="grid gap-1 px-4 py-3">
          <b className="text-sm">AI が判定できなかったので、みんなで確認してください</b>
          <span className="text-sm font-medium">
            写真に合言葉「{log.passphrase}」が写っているか、宣言どおりの内容かを見てください。おかしければ「怪しい」を押せます。
          </span>
        </Sticker>
      ) : null}

      {can.flag ? (
        <Sticker shadow="sm" className="grid gap-2 px-4 py-3">
          <span className="text-sm font-medium">
            写真や振り返りが宣言と合わない、合言葉がおかしいなどと思ったら指摘できます（
            {log.disputeWindowEndsAt ? formatJstDateTime(log.disputeWindowEndsAt) : ""} まで）。
          </span>
          <FlagForm logId={log.id} ownerName={owner.name} target="submission" />
        </Sticker>
      ) : null}

      <section className="grid gap-4">
        <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">提出</h2>
        {detail.submissions.length === 0 ? <p className="m-0 text-sm text-sub">まだ提出はありません</p> : null}
        {detail.submissions.map((submission) => (
          <SubmissionBlock key={submission.id} submission={submission} />
        ))}
      </section>

      <section className="grid gap-3">
        <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">この日のタイムライン</h2>
        <Timeline items={(await getTimeline({ limit: 50, studyLogId: log.id })).items} />
      </section>

      {dispute && can.resend ? (
        <Sticker data-tip="flagged" tone="tape" className="grid gap-3 px-4 py-4">
          <b>証拠を送り直す</b>
          <span className="text-sm font-medium">
            {formatJstDateTime(dispute.resendDueAt)} まで（あと <Countdown until={dispute.resendDueAt} />
            ）なら何度でも送り直せます。合言葉を写した写真を入れてください。
          </span>
          <ResendForm logId={log.id} userId={detail.meId} date={log.date} />
        </Sticker>
      ) : null}

      <LogTip detail={detail} />
    </div>
  );
}

/** Coach marks (F15): flagged and resending, asked for the final review, or able to flag. */
async function LogTip({ detail }: { detail: LogDetail }) {
  const { dispute, can } = detail;
  if (!(dispute && can.resend) && !can.review && !can.flag) return null;
  const supabase = await createClient();
  const { data: settings, error } = await supabase.from("group_settings").select("penalty_fake_evidence").single();
  if (error) throw error;
  return (
    <PageTip
      candidates={[
        dispute && can.resend && ["flagged", TIPS.flagged({ target: "submission", dueAt: formatJstDateTime(dispute.resendDueAt) })],
        can.review && ["review", TIPS.review({ target: "dispute", yen: settings.penalty_fake_evidence })],
        can.flag && ["peer_buttons", TIPS.peer_buttons],
      ]}
    />
  );
}

/** The owner asked everyone else to judge a day the AI rejected every time (F5c). */
function AppealSection({ detail }: { detail: LogDetail }) {
  const { appeal, can, log, owner } = detail;
  if (!appeal) return null;
  return (
    <Sticker tone="tape" className="grid gap-3 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <b>メンバーに判定を頼みました</b>
        <Pill variant="outline">{APPEAL[appeal.status] ?? appeal.status}</Pill>
      </div>
      <p className="m-0 text-sm whitespace-pre-wrap">
        <b>{owner.name} さんの理由:</b> {appeal.reason}
      </p>
      {appeal.status === "under_review" ? (
        <p className="m-0 text-xs font-bold">
          AI は不合格にしましたが、本人はやったと言っています。下の写真と振り返りを見てください。
          {formatJstDateTime(appeal.reviewDueAt)} までに全員が「認める」を押したら
          {log.isMakeup ? "補習を 1 回返したことに" : "達成に"}なります。1 人でも認めないか、そろわなければ
          {log.isMakeup ? "数えません" : "未達成"}です。
        </p>
      ) : null}
      {appeal.reviews.length > 0 ? (
        <ul className="m-0 grid list-none gap-1 p-0 text-xs">
          {appeal.reviews.map((review) => (
            <li key={review.reviewerId}>
              {review.name}: {review.verdict === "accept" ? "認める" : review.verdict === "reject" ? `認めない（${review.comment}）` : "まだ"}
            </li>
          ))}
        </ul>
      ) : null}
      {can.reviewAppeal ? <AppealReview logId={log.id} /> : null}
    </Sticker>
  );
}

function DisputeSection({ detail }: { detail: LogDetail }) {
  const { dispute, submissionFlags, reviews, can, log } = detail;
  if (!dispute && submissionFlags.length === 0) return null;
  return (
    <Sticker tone="alert" className="grid gap-3 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <Stamp tone="red" label="怪しい" className="text-lg" />
        {dispute ? <Pill variant="outline">{DISPUTE[dispute.status] ?? dispute.status}</Pill> : null}
      </div>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {submissionFlags.map((flag) => (
          <li key={flag.flaggerId} className="text-sm">
            <b>{flag.name}</b>
            {flag.withdrawnAt ? <span className="text-sub">（取り下げ済み）</span> : null}: {flag.comment}
          </li>
        ))}
      </ul>
      {dispute?.status === "resending" ? (
        <p className="m-0 text-xs font-bold">
          {formatJstDateTime(dispute.resendDueAt)} までに指摘した全員が取り下げれば達成。そろわなければ全員の最終審査になります。
        </p>
      ) : null}
      {dispute?.status === "final_review" && dispute.reviewDueAt ? (
        <p className="m-0 text-xs font-bold">
          {formatJstDateTime(dispute.reviewDueAt)} まで。理由付きの却下が 1 人でもあれば証拠不認定、なければ達成で確定します。
        </p>
      ) : null}
      {reviews.length > 0 ? (
        <ul className="m-0 grid list-none gap-1 p-0 text-xs">
          {reviews.map((review) => (
            <li key={review.reviewerId}>
              {review.name}: {review.verdict === "accept" ? "認める" : review.verdict === "reject" ? `却下（${review.comment}）` : "まだ"}
            </li>
          ))}
        </ul>
      ) : null}
      {can.withdraw ? <WithdrawFlagButton logId={log.id} /> : null}
      {can.review ? (
        <div data-tip="review">
          <DisputeReview logId={log.id} />
        </div>
      ) : null}
    </Sticker>
  );
}

function SubmissionBlock({ submission }: { submission: DetailSubmission }) {
  return (
    <div className="grid gap-2.5">
      <p className="m-0 text-sm font-bold">
        {submission.kind === "resend" ? "送り直し" : `${submission.attemptNo} 回目`} ・ {formatJstDateTime(submission.submittedAt)}
        {submission.status === "judging" ? " ・ 判定中" : submission.status === "error" ? " ・ 判定待ち" : ""}
      </p>
      {submission.photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {submission.photos.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
              <Sticker shadow="sm" className="aspect-square overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage */}
                <img src={url} alt="提出された写真" className="size-full object-cover" />
              </Sticker>
            </a>
          ))}
        </div>
      ) : (
        <p className="m-0 text-xs text-sub">写真は保存期間を過ぎたため削除されました</p>
      )}
      {submission.kind === "resend" ? (
        <p className="m-0 text-sm">
          <b>説明:</b> {submission.explanation}
        </p>
      ) : (
        <div className="grid gap-1 text-sm">
          <p className="m-0">
            <b>学んだこと:</b> {submission.learned}
          </p>
          <p className="m-0">
            <b>できなかったこと:</b> {submission.struggled}
          </p>
          <p className="m-0 text-xs text-sub">自己評価 {submission.selfRating} / 5</p>
        </div>
      )}
      {submission.status === "passed" || submission.status === "rejected" ? (
        <JudgeKarte
          result={{
            score: submission.score ?? 0,
            passed: submission.status === "passed",
            passphraseFound: Boolean(submission.passphraseFound),
            elapsedMinutes: submission.elapsedMinutes ?? 0,
            feedback: submission.feedback ?? "",
            disputeWindowEndsAt: null,
            attemptsLeft: 0,
            unverified: submission.unverified,
            hideFooter: true,
          }}
        />
      ) : null}
    </div>
  );
}
