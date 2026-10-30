import { NextResponse, type NextRequest } from "next/server";
import { cronEnv } from "@/lib/env.server";
import { summarizeWeek } from "@/lib/gemini/weekly-summary";
import { judgeSubmission } from "@/lib/judging";
import { dispatch } from "@/lib/notify";
import { secureEqual } from "@/lib/secure-compare";
import { recordStandingChanges } from "@/lib/standing/record";
import { createAdminClient } from "@/lib/supabase/admin";

// Called by pg_cron every 5 minutes (docs/architecture.md §2.5, ADR-003). Runs every scheduled
// step in the database (public.tick), tells people about what happened, and re-judges
// submissions that failed to judge. Everything is idempotent, so retries and overlaps are safe.

export const maxDuration = 60;

/** Submissions re-judged per tick: the Gemini free tier allows only a few requests a minute. */
const REJUDGE_LIMIT = 3;
/** Weekly summaries written per tick (same reason); the rest follow on the next ticks. */
const SUMMARY_LIMIT = 2;
/** Submissions whose original photos are deleted per tick (up to 3 files each). */
const PURGE_LIMIT = 100;

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secureEqual(token, cronEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: events, error } = await admin.rpc("tick");
  if (error) {
    console.error("tick failed", error);
    return NextResponse.json({ error: "tick failed" }, { status: 500 });
  }
  for (const event of events) await dispatch(event.id);

  // Titles, ranks and the crown (F13, F14) follow from what the tick just settled.
  const standings = await recordStandingChanges().catch((standingsError) => {
    console.error("standings failed", standingsError);
    return [];
  });
  for (const event of standings) await dispatch(event.id);

  const rejudged = await rejudgeStuckSubmissions();
  const summarized = await fillWeeklySummaries();
  const purged = (await purgeOriginalImages()) + (await purgeStudyPhotos());
  return NextResponse.json({ events: events.length, standings: standings.length, rejudged, summarized, purged });
}

/**
 * Errors (rate limits, outages) and judgements that never finished, oldest first. Only for days
 * still open: once a day is closed (missed, no declaration) its submissions can't change it.
 */
async function rejudgeStuckSubmissions(): Promise<number> {
  const admin = createAdminClient();
  const stuckBefore = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data, error } = await admin
    .from("submissions")
    .select("id, study_logs!inner(status)")
    .or(`status.eq.error,and(status.eq.judging,submitted_at.lt.${stuckBefore})`)
    .in("study_logs.status", ["pending", "passed"])
    .order("submitted_at")
    .limit(REJUDGE_LIMIT);
  if (error) {
    console.error("listing stuck submissions failed", error);
    return 0;
  }
  let count = 0;
  for (const submission of data) {
    const outcome = await judgeSubmission(submission.id);
    if (outcome.status === "passed" || outcome.status === "rejected") count += 1;
  }
  return count;
}

/** Weekly reviews still without an AI summary (new ones, or a Gemini call that failed). */
async function fillWeeklySummaries(): Promise<number> {
  const admin = createAdminClient();
  const { data: reviews, error } = await admin
    .from("weekly_reviews")
    .select("user_id, week_end, stats, profiles(display_name)")
    .is("ai_summary", null)
    .order("week_end")
    .limit(SUMMARY_LIMIT);
  if (error) {
    console.error("listing weekly reviews failed", error);
    return 0;
  }

  let count = 0;
  for (const review of reviews) {
    try {
      const from = new Date(`${review.week_end}T00:00:00Z`);
      from.setUTCDate(from.getUTCDate() - 6);
      const { data: logs, error: logsError } = await admin
        .from("study_logs")
        .select("date, status, declaration, submissions(kind, status, learned_text, struggled_text, submitted_at)")
        .eq("user_id", review.user_id)
        .eq("is_makeup", false)
        .gte("date", from.toISOString().slice(0, 10))
        .lte("date", review.week_end)
        .order("date");
      if (logsError) throw logsError;

      const days = logs.map((log) => {
        const regular = log.submissions
          .filter((submission) => submission.kind === "regular")
          .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
        const shown = regular.find((submission) => submission.status === "passed") ?? regular.at(-1);
        return {
          date: log.date,
          declaration: log.declaration,
          result: log.status,
          learned: shown?.learned_text ?? null,
          struggled: shown?.struggled_text ?? null,
        };
      });
      const profile = Array.isArray(review.profiles) ? review.profiles[0] : review.profiles;
      const { summary, model } = await summarizeWeek({
        name: profile?.display_name ?? "メンバー",
        stats: review.stats as Record<string, unknown>,
        days,
      });
      const { error: saveError } = await admin.rpc("record_weekly_summary", {
        p_user_id: review.user_id,
        p_week_end: review.week_end,
        p_summary: summary,
        p_model: model,
      });
      if (saveError) throw saveError;
      count += 1;
    } catch (cause) {
      console.error("weekly summary failed", review.user_id, review.week_end, cause instanceof Error ? cause.message : cause);
    }
  }
  return count;
}


/**
 * Original photos past the retention period, or the oldest while storage is over budget
 * (rpc due_image_purges). Files go through the Storage API first; only then is the purge
 * recorded, so a failed removal is retried on the next tick. Thumbnails stay.
 */
async function purgeOriginalImages(): Promise<number> {
  const admin = createAdminClient();
  const { data: due, error } = await admin.rpc("due_image_purges", { p_limit: PURGE_LIMIT });
  if (error) {
    console.error("listing image purges failed", error);
    return 0;
  }
  if (due.length === 0) return 0;

  // Files already gone are not an error for remove(), so a half-finished earlier run is fine.
  const { error: removeError } = await admin.storage.from("study-evidence").remove(due.flatMap((row) => row.image_paths));
  if (removeError) {
    console.error("removing images failed", removeError);
    return 0;
  }
  const { data: purged, error: markError } = await admin.rpc("mark_images_purged", {
    p_submission_ids: due.map((row) => row.submission_id),
  });
  if (markError) {
    console.error("recording image purges failed", markError);
    return 0;
  }
  return purged;
}

/** The same for photos taken while studying (F4c, rpc due_photo_purges). Thumbnails stay. */
async function purgeStudyPhotos(): Promise<number> {
  const admin = createAdminClient();
  const { data: due, error } = await admin.rpc("due_photo_purges", { p_limit: PURGE_LIMIT });
  if (error) {
    console.error("listing study photo purges failed", error);
    return 0;
  }
  if (due.length === 0) return 0;

  const { error: removeError } = await admin.storage.from("study-evidence").remove(due.map((row) => row.image_path));
  if (removeError) {
    console.error("removing study photos failed", removeError);
    return 0;
  }
  const { data: purged, error: markError } = await admin.rpc("mark_photos_purged", { p_photo_ids: due.map((row) => row.photo_id) });
  if (markError) {
    console.error("recording study photo purges failed", markError);
    return 0;
  }
  return purged;
}
