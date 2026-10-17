import { NextResponse, type NextRequest } from "next/server";
import { cronEnv } from "@/lib/env.server";
import { judgeSubmission } from "@/lib/judging";
import { dispatch } from "@/lib/notify";
import { secureEqual } from "@/lib/secure-compare";
import { createAdminClient } from "@/lib/supabase/admin";

// Called by pg_cron every 5 minutes (docs/architecture.md §2.5, ADR-003). Runs every scheduled
// step in the database (public.tick), tells people about what happened, and re-judges
// submissions that failed to judge. Everything is idempotent, so retries and overlaps are safe.

export const maxDuration = 60;

/** Submissions re-judged per tick: the Gemini free tier allows only a few requests a minute. */
const REJUDGE_LIMIT = 3;

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

  const rejudged = await rejudgeStuckSubmissions();
  return NextResponse.json({ events: events.length, rejudged });
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
