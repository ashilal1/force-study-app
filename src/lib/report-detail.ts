import "server-only";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ReasonAmounts } from "@/components/report/reason-form";

// A missed day's reason report and its review (/reports/[logId]). Read through RLS.

export type ReportDetail = {
  now: number;
  meId: string;
  owner: { id: string; name: string };
  log: { id: string; date: string; declaration: string | null; targetEndTime: string | null; missedAt: string | null };
  report: {
    status: string;
    category: string | null;
    reasonText: string | null;
    nextPlanText: string | null;
    streak: number | null;
    dueAt: string;
    reviewDueAt: string | null;
    outcome: string | null;
  };
  reviews: { reviewerId: string; name: string; verdict: string | null; comment: string | null }[];
  points: number | null;
  /** Recorded during the trial week only ("本番なら"). */
  waived: boolean;
  /** Resolved unrealistic misses in a row just before this day (for the form). */
  streakBefore: number;
  minChars: number;
  amounts: ReasonAmounts;
  can: { report: boolean; review: boolean };
};

export async function getReportDetail(logId: string): Promise<ReportDetail | null> {
  const me = await requireMember();
  const supabase = await createClient();
  const [{ data: log, error: logError }, { data: report, error: reportError }] = await Promise.all([
    supabase.from("study_logs").select("id, user_id, date, declaration, target_end_time, missed_at").eq("id", logId).maybeSingle(),
    supabase
      .from("failure_reports")
      .select("status, category, reason_text, next_plan_text, unrealistic_streak, report_due_at, review_due_at, outcome")
      .eq("study_log_id", logId)
      .maybeSingle(),
  ]);
  if (logError) throw logError;
  if (reportError) throw reportError;
  if (!log || !report) return null;

  const [profiles, reviews, settings, penalty, history] = await Promise.all([
    supabase.from("profiles").select("id, display_name"),
    supabase.from("peer_reviews").select("reviewer_id, verdict, comment").eq("subject_type", "excuse").eq("subject_id", logId),
    supabase
      .from("group_settings")
      .select("min_explanation_chars, penalty_slacked, penalty_unrealistic_streak, penalty_excuse_rejected, unrealistic_streak_threshold")
      .single(),
    supabase.from("penalties").select("points, waived").eq("study_log_id", logId).maybeSingle(),
    supabase
      .from("study_logs")
      .select("status, failure_reports(category, status)")
      .eq("user_id", log.user_id)
      .lt("date", log.date)
      .eq("is_makeup", false)
      .neq("status", "no_declaration")
      .order("date", { ascending: false })
      .limit(30),
  ]);
  for (const result of [profiles, reviews, settings, penalty, history]) if (result.error) throw result.error;

  // Same rule as private.unrealistic_streak (display only).
  let streakBefore = 0;
  for (const day of history.data!) {
    // One report per day; PostgREST types the embed as a list (composite foreign key).
    const previous = Array.isArray(day.failure_reports) ? day.failure_reports[0] : day.failure_reports;
    if (day.status !== "missed" || previous?.status !== "resolved" || previous.category !== "unrealistic") break;
    streakBefore += 1;
  }

  const now = Date.now();
  const name = (id: string) => profiles.data!.find((profile) => profile.id === id)?.display_name ?? "メンバー";
  const myReview = reviews.data!.find((review) => review.reviewer_id === me.id);

  return {
    now,
    meId: me.id,
    owner: { id: log.user_id, name: name(log.user_id) },
    log: { id: log.id, date: log.date, declaration: log.declaration, targetEndTime: log.target_end_time, missedAt: log.missed_at },
    report: {
      status: report.status,
      category: report.category,
      reasonText: report.reason_text,
      nextPlanText: report.next_plan_text,
      streak: report.unrealistic_streak,
      dueAt: report.report_due_at,
      reviewDueAt: report.review_due_at,
      outcome: report.outcome,
    },
    reviews: reviews.data!.map((review) => ({
      reviewerId: review.reviewer_id,
      name: name(review.reviewer_id),
      verdict: review.verdict,
      comment: review.comment,
    })),
    points: penalty.data?.points ?? null,
    waived: penalty.data?.waived === "trial",
    streakBefore,
    minChars: settings.data!.min_explanation_chars,
    amounts: {
      slacked: settings.data!.penalty_slacked,
      unrealisticStreak: settings.data!.penalty_unrealistic_streak,
      excuseRejected: settings.data!.penalty_excuse_rejected,
      streakThreshold: settings.data!.unrealistic_streak_threshold,
    },
    can: {
      report: log.user_id === me.id && report.status === "awaiting_report" && now <= new Date(report.report_due_at).getTime(),
      review:
        report.status === "under_review" &&
        report.review_due_at !== null &&
        now <= new Date(report.review_due_at).getTime() &&
        myReview !== undefined &&
        myReview.verdict === null,
    },
  };
}
