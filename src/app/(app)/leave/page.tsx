import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/app/page-loading";
import { Pill } from "@/components/brand/pill";
import { Sticker } from "@/components/brand/sticker";
import { CancelLeave, LeaveReview } from "@/components/leave/leave-actions";
import { LeaveForm } from "@/components/leave/leave-form";
import { TermHelp } from "@/components/onboarding/term-help";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatJstDay, formatJstTime } from "@/lib/time";
import { getSettings, getTodayBoard } from "@/lib/today";

export const metadata: Metadata = { title: "休会 | Commit or Treat" };

const STATUS: Record<string, string> = {
  under_review: "審査中",
  approved: "休会",
  rejected: "不成立",
  cancelled: "取り消し",
};

export default function LeavePage() {
  return (
    <div className="grid gap-6">
      <h1 className="m-0 flex items-center gap-2 font-heading text-[1.55rem] leading-tight font-normal">
        休会
        <TermHelp term="rest_vs_leave" />
      </h1>
      <p className="m-0 text-sm font-medium text-sub">
        テスト期間や旅行など、休息日では足りないときに使います。休会中は宣言も審査もお休みで、休息日の数にも入りません。
      </p>
      <Suspense fallback={<PageLoading />}>
        <LeaveContent />
      </Suspense>
    </div>
  );
}

type Request = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  review_due_at: string;
  cancelled_from: string | null;
};
type Vote = { subject_id: string; reviewer_id: string; verdict: string | null; comment: string | null };

async function LeaveContent() {
  const me = await requireMember();
  const [{ date, now }, settings] = await Promise.all([getTodayBoard(), getSettings()]);
  const supabase = await createClient();

  const [requests, reviews, profiles] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, user_id, start_date, end_date, reason, status, review_due_at, cancelled_from")
      .or(`status.eq.under_review,end_date.gte.${date}`)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("peer_reviews").select("subject_id, reviewer_id, verdict, comment").eq("subject_type", "leave"),
    supabase.from("profiles").select("id, display_name"),
  ]);
  if (requests.error) throw requests.error;
  if (reviews.error) throw reviews.error;
  if (profiles.error) throw profiles.error;

  const name = (id: string) => profiles.data.find((profile) => profile.id === id)?.display_name ?? "メンバー";
  const votesFor = (id: string): Vote[] => reviews.data.filter((review) => review.subject_id === id);
  const reviewOpen = (request: Request) =>
    request.status === "under_review" && now <= new Date(request.review_due_at).getTime();

  const toReview = requests.data.filter(
    (request) =>
      reviewOpen(request) && votesFor(request.id).some((vote) => vote.reviewer_id === me.id && vote.verdict === null),
  );
  const mine = requests.data.filter((request) => request.user_id === me.id);
  const others = requests.data.filter((request) => request.user_id !== me.id && !toReview.includes(request));

  return (
    <>
      {toReview.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">審査してほしい休会</h2>
          {toReview.map((request) => (
            <Sticker key={request.id} tone="tape" className="grid gap-2 px-4 py-3.5">
              <b>
                {name(request.user_id)} さん ・ {formatJstDay(request.start_date)}〜{formatJstDay(request.end_date)}
              </b>
              <p className="m-0 text-sm font-medium whitespace-pre-wrap">{request.reason}</p>
              <p className="m-0 text-xs font-bold">今日 {formatJstTime(request.review_due_at)} までに審査してください</p>
              <LeaveReview leaveRequestId={request.id} />
            </Sticker>
          ))}
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">休会を申請する</h2>
        <Sticker className="px-4 py-4">
          <LeaveForm minDate={addDays(date, 1)} minChars={settings.min_explanation_chars} />
        </Sticker>
      </section>

      <LeaveList title="あなたの休会" items={mine} name={name} votesFor={votesFor} date={date} own />
      <LeaveList title="みんなの休会" items={others} name={name} votesFor={votesFor} date={date} />
    </>
  );
}

function LeaveList({
  title,
  items,
  name,
  votesFor,
  date,
  own = false,
}: {
  title: string;
  items: Request[];
  name: (id: string) => string;
  votesFor: (id: string) => Vote[];
  date: string;
  own?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="grid gap-3">
      <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">{title}</h2>
      {items.map((request) => {
        const votes = votesFor(request.id);
        const accepted = votes.filter((vote) => vote.verdict === "accept").length;
        const cancellable =
          own && (request.status === "under_review" || (request.status === "approved" && request.end_date > date));
        return (
          <Sticker key={request.id} shadow="sm" className="grid gap-1.5 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <b className="text-sm">
                {own ? "" : `${name(request.user_id)} さん ・ `}
                {formatJstDay(request.start_date)}〜{formatJstDay(request.end_date)}
              </b>
              <Pill variant={request.status === "approved" ? "ink" : "outline"}>{STATUS[request.status]}</Pill>
            </div>
            <p className="m-0 text-sm font-medium whitespace-pre-wrap">{request.reason}</p>
            {request.status === "under_review" ? (
              <p className="m-0 text-xs text-sub">
                承認 {accepted}/{votes.length}
              </p>
            ) : null}
            {request.cancelled_from ? (
              <p className="m-0 text-xs text-sub">{formatJstDay(request.cancelled_from)} から取り消し</p>
            ) : null}
            {votes
              .filter((vote) => vote.comment)
              .map((vote) => (
                <p key={vote.reviewer_id} className="m-0 text-xs">
                  <b>{name(vote.reviewer_id)}</b>（{vote.verdict === "accept" ? "承認" : "却下"}）: {vote.comment}
                </p>
              ))}
            {cancellable ? (
              <CancelLeave
                leaveRequestId={request.id}
                label={request.status === "under_review" ? "申請を取り下げる" : "明日から休会をやめる"}
              />
            ) : null}
          </Sticker>
        );
      })}
    </section>
  );
}
