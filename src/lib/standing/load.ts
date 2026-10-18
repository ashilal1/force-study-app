import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DayKind } from "@/lib/chart-colors";
import { requireMember } from "@/lib/auth";
import { fetchAll as all } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { jstDateString } from "@/lib/time";
import type { Database } from "@/types/database";
import { computeStandings, lastCloseOf, type Standing, type StandingDay, type StandingInput } from "./rules";

// Reads everything titles and ranks are computed from (F13, F14) for one group, then computes.
// Through RLS for pages (getStandings); the tick passes the admin client and a group id.

type Client = SupabaseClient<Database>;

/** Standings of the viewer's group, read through RLS. Deduplicated per request. */
export const getStandings = cache(async (): Promise<Map<string, Standing>> => {
  await requireMember();
  return loadStandings(await createClient());
});

/**
 * Standings of one group. With the RLS client the group is the viewer's; the admin client must
 * pass `groupId` (it reads every group otherwise).
 */
export async function loadStandings(supabase: Client, groupId?: string): Promise<Map<string, Standing>> {
  let profilesQuery = supabase.from("profiles").select("id, created_at, trial_ends_at, group_id").is("deactivated_at", null);
  let settingsQuery = supabase.from("group_settings").select("settlement_weekday, settlement_time, unrealistic_streak_threshold");
  if (groupId) {
    profilesQuery = profilesQuery.eq("group_id", groupId);
    settingsQuery = settingsQuery.eq("group_id", groupId);
  }
  const [profiles, settings] = await Promise.all([profilesQuery, settingsQuery.single()]);
  if (profiles.error) throw profiles.error;
  if (settings.error) throw settings.error;
  const ids = profiles.data.map((profile) => profile.id);
  if (ids.length === 0) return new Map();

  const [history, logs, passed, flags, penalties, reports, settlements, sessions, debts, summaries] = await Promise.all([
    all((from, to) =>
      supabase
        .from("daily_history")
        .select("user_id, date, kind, final_score, attempts, failure_category, in_trial, study_log_id")
        .in("user_id", ids)
        .order("user_id")
        .order("date")
        .range(from, to),
    ),
    all((from, to) =>
      supabase
        .from("study_logs")
        .select("id, declared_at, target_end_time, completed_at")
        .in("user_id", ids)
        .eq("is_makeup", false)
        .order("id")
        .range(from, to),
    ),
    all((from, to) =>
      supabase
        .from("submissions")
        .select("study_log_id, submitted_at")
        .in("user_id", ids)
        .eq("kind", "regular")
        .eq("status", "passed")
        .order("id")
        .range(from, to),
    ),
    supabase.from("submission_flags").select("study_log_id, created_at, study_logs!inner(user_id)").in("study_logs.user_id", ids),
    all((from, to) =>
      supabase.from("penalties").select("user_id, reason, created_at, waived, late_settlement_id").in("user_id", ids).order("id").range(from, to),
    ),
    supabase
      .from("failure_reports")
      .select("user_id, reported_at")
      .in("user_id", ids)
      .eq("category", "unrealistic")
      .eq("outcome", "no_penalty"),
    supabase.from("settlements").select("id, debtor_id, period_end, amount_yen, status").in("debtor_id", ids),
    supabase.from("study_logs").select("user_id, status, passed_at, completed_at").in("user_id", ids).eq("is_makeup", true),
    supabase.from("makeup_debts").select("user_id, reason, count, waived, due_at, created_at").in("user_id", ids),
    supabase.from("makeup_summary").select("user_id, overdue").in("user_id", ids),
  ]);
  for (const result of [history, logs, passed, flags, penalties, reports, settlements, sessions, debts, summaries]) {
    if (result.error) throw result.error;
  }

  const logById = new Map(logs.data!.map((log) => [log.id, log]));
  const passedByLog = new Map(passed.data!.map((submission) => [submission.study_log_id, submission.submitted_at]));
  const flagsByLog = new Map<string, string[]>();
  for (const flag of flags.data!) flagsByLog.set(flag.study_log_id, [...(flagsByLog.get(flag.study_log_id) ?? []), flag.created_at]);
  const lateSettlements = new Set(penalties.data!.flatMap((penalty) => (penalty.late_settlement_id ? [penalty.late_settlement_id] : [])));

  const inputs: StandingInput[] = profiles.data.map((profile) => ({
    memberId: profile.id,
    joinedOn: jstDateString(new Date(profile.created_at)),
    trialEndsAt: profile.trial_ends_at,
    days: history
      .data!.filter((row) => row.user_id === profile.id)
      .map((row): StandingDay => {
        const log = row.study_log_id ? logById.get(row.study_log_id) : undefined;
        return {
          date: row.date!,
          kind: (row.kind ?? "none") as DayKind,
          inTrial: row.in_trial ?? false,
          finalScore: row.final_score,
          attempts: row.attempts ?? 0,
          failureCategory: row.failure_category,
          declaredAt: log?.declared_at ?? null,
          targetEndTime: log?.target_end_time ?? null,
          passedSubmittedAt: row.study_log_id ? (passedByLog.get(row.study_log_id) ?? null) : null,
          completedAt: log?.completed_at ?? null,
          flaggedAt: row.study_log_id ? (flagsByLog.get(row.study_log_id) ?? []) : [],
        };
      }),
    penalties: penalties
      .data!.filter((penalty) => penalty.user_id === profile.id)
      .map((penalty) => ({ reason: penalty.reason, at: penalty.created_at, waived: penalty.waived !== null })),
    freeUnrealisticAt: reports.data!.flatMap((report) => (report.user_id === profile.id && report.reported_at ? [report.reported_at] : [])),
    settlements: settlements
      .data!.filter((settlement) => settlement.debtor_id === profile.id)
      .map((settlement) => ({
        periodEnd: settlement.period_end,
        amount: settlement.amount_yen,
        status: settlement.status,
        late: lateSettlements.has(settlement.id),
      })),
    makeup: {
      completedAt: sessions.data!.flatMap((session) =>
        session.user_id === profile.id && session.status === "completed" && session.completed_at ? [session.completed_at] : [],
      ),
      passedAt: sessions.data!.flatMap((session) =>
        session.user_id === profile.id && (session.status === "passed" || session.status === "completed") && session.passed_at
          ? [session.passed_at]
          : [],
      ),
      debts: debts
        .data!.filter((debt) => debt.user_id === profile.id)
        .map((debt) => ({ reason: debt.reason, count: debt.count, waived: debt.waived !== null, dueAt: debt.due_at, createdAt: debt.created_at })),
      overdue: summaries.data!.find((summary) => summary.user_id === profile.id)?.overdue ?? 0,
    },
  }));

  const now = Date.now();
  const today = jstDateString(new Date(now));
  return computeStandings(inputs, {
    today,
    now,
    lastClose: lastCloseOf(today, now, settings.data.settlement_weekday, settings.data.settlement_time),
    unrealisticStreakThreshold: settings.data.unrealistic_streak_threshold,
  });
}
