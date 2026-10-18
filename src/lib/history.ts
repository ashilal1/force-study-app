import "server-only";
import { requireMember } from "@/lib/auth";
import type { DayKind } from "@/lib/chart-colors";
import { rangeStart, type HistoryDay, type Range } from "@/lib/stats";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { jstDateString } from "@/lib/time";

// Data for the retrospective screens (F12). Aggregation happens in the database views
// (daily_history, weekly_stats, received_objections); this shapes rows for the charts.

export type DayRow = HistoryDay & {
  studyLogId: string | null;
  declaration: string | null;
  attempts: number;
  submittedHour: number | null;
  penaltyReason: string | null;
  failureCategory: string | null;
};

export type WeekRow = { weekEnd: string; rate: number | null; avgScore: number | null; penalty: number; completed: number; counted: number };

export type PenaltyRow = { weekEnd: string; reason: string; points: number };

export type ObjectionRow = {
  occurredAt: string;
  kind: string;
  by: string | null;
  reason: string | null;
  studyLogId: string | null;
};

export type NextPlanRow = {
  date: string;
  studyLogId: string;
  plan: string;
  next: { date: string; declaration: string | null; kind: DayKind; studyLogId: string | null } | null;
};

export type MemberHistory = {
  member: { id: string; name: string; avatarUrl: string | null; colorIndex: number };
  today: string;
  /** Whole history (for streaks and the calendar's earlier weeks). */
  allDays: DayRow[];
  /** Days within the selected range. */
  days: DayRow[];
  weeks: WeekRow[];
  groupWeeks: { weekEnd: string; rate: number | null; completed: number; counted: number }[];
  penalties: PenaltyRow[];
  objections: ObjectionRow[];
  nextPlans: NextPlanRow[];
};

const saturdayOf = (date: string) => {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + (6 - at.getUTCDay()));
  return at.toISOString().slice(0, 10);
};

export function toDayRow(row: {
  date: string | null;
  kind: string | null;
  study_log_id: string | null;
  declaration: string | null;
  final_score: number | null;
  attempts: number | null;
  elapsed_minutes: number | null;
  submitted_hour: number | null;
  penalty_points: number | null;
  trial_points: number | null;
  penalty_reason: string | null;
  failure_category: string | null;
}): DayRow {
  return {
    date: row.date!,
    kind: (row.kind ?? "none") as DayKind,
    studyLogId: row.study_log_id,
    declaration: row.declaration,
    finalScore: row.final_score,
    attempts: row.attempts ?? 0,
    elapsedMinutes: row.elapsed_minutes,
    submittedHour: row.submitted_hour,
    penaltyPoints: row.penalty_points ?? 0,
    trialPoints: row.trial_points ?? 0,
    penaltyReason: row.penalty_reason,
    failureCategory: row.failure_category,
  };
}

export async function getMemberHistory(userId: string, range: Range): Promise<MemberHistory | null> {
  await requireMember();
  const supabase = await createClient();
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .order("created_at");
  if (profilesError) throw profilesError;
  const index = profiles.findIndex((profile) => profile.id === userId);
  if (index < 0) return null;

  const today = jstDateString();
  const from = rangeStart(range, today);
  const [days, weeks, groupWeeks, penalties, objections, reports] = await Promise.all([
    fetchAll((from, to) => supabase.from("daily_history").select("*").eq("user_id", userId).order("date").range(from, to)),
    supabase
      .from("weekly_stats")
      .select("week_end, achievement_rate, avg_score, penalty_points, completed_days, counted_days")
      .eq("user_id", userId)
      .order("week_end"),
    // Every member's weeks: past 1000 rows after a few years.
    fetchAll((from, to) =>
      supabase.from("weekly_stats").select("week_end, completed_days, counted_days").order("user_id").order("week_end").range(from, to),
    ),
    supabase
      .from("penalties")
      .select("reason, points, created_at, waived, study_logs(date)")
      .eq("user_id", userId)
      .is("waived", null),
    supabase.from("received_objections").select("*").eq("user_id", userId).order("occurred_at", { ascending: false }),
    supabase
      .from("failure_reports")
      .select("study_log_id, next_plan_text, study_logs(date)")
      .eq("user_id", userId)
      .eq("category", "unrealistic"),
  ]);
  for (const result of [days, weeks, groupWeeks, penalties, objections, reports]) if (result.error) throw result.error;

  const allDays = days.data!.map(toDayRow);
  const inRange = (date: string) => from === null || date >= from;
  const name = (id: string | null) => (id ? (profiles.find((profile) => profile.id === id)?.display_name ?? "メンバー") : null);

  // Group average per week: completed / counted over everyone.
  const group = new Map<string, { completed: number; counted: number }>();
  for (const row of groupWeeks.data!) {
    const entry = group.get(row.week_end!) ?? { completed: 0, counted: 0 };
    entry.completed += row.completed_days ?? 0;
    entry.counted += row.counted_days ?? 0;
    group.set(row.week_end!, entry);
  }

  const nextPlans: NextPlanRow[] = reports
    .data!.flatMap((report) => {
      const log = Array.isArray(report.study_logs) ? report.study_logs[0] : report.study_logs;
      if (!log || !report.next_plan_text) return [];
      const next = allDays.find((day) => day.date > log.date && day.declaration !== null);
      return [
        {
          date: log.date,
          studyLogId: report.study_log_id,
          plan: report.next_plan_text,
          next: next ? { date: next.date, declaration: next.declaration, kind: next.kind, studyLogId: next.studyLogId } : null,
        },
      ];
    })
    .filter((row) => inRange(row.date))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    member: { id: userId, name: profiles[index].display_name, avatarUrl: profiles[index].avatar_url, colorIndex: index },
    today,
    allDays,
    days: allDays.filter((day) => inRange(day.date)),
    weeks: weeks
      .data!.filter((week) => inRange(week.week_end!))
      .map((week) => ({
        weekEnd: week.week_end!,
        rate: week.achievement_rate,
        avgScore: week.avg_score,
        penalty: week.penalty_points ?? 0,
        completed: week.completed_days ?? 0,
        counted: week.counted_days ?? 0,
      })),
    groupWeeks: [...group]
      .filter(([weekEnd]) => inRange(weekEnd))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekEnd, entry]) => ({
        weekEnd,
        rate: entry.counted === 0 ? null : Math.round((100 * entry.completed) / entry.counted),
        completed: entry.completed,
        counted: entry.counted,
      })),
    penalties: penalties
      .data!.map((penalty) => {
        const log = Array.isArray(penalty.study_logs) ? penalty.study_logs[0] : penalty.study_logs;
        const date = log?.date ?? jstDateString(new Date(penalty.created_at));
        return { weekEnd: saturdayOf(date), reason: penalty.reason, points: penalty.points, date };
      })
      .filter((penalty) => inRange(penalty.date))
      .map(({ weekEnd, reason, points }) => ({ weekEnd, reason, points })),
    objections: objections
      .data!.filter((row) => row.occurred_at && inRange(jstDateString(new Date(row.occurred_at))))
      .map((row) => ({
        occurredAt: row.occurred_at!,
        kind: row.kind!,
        by: name(row.by_user_id),
        reason: row.reason,
        studyLogId: row.study_log_id,
      })),
    nextPlans,
  };
}

export type GroupMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  colorIndex: number;
  days: DayRow[];
  allDays: DayRow[];
  weeks: { weekEnd: string; rate: number | null; completed: number; counted: number }[];
};

/** Everyone's history for the comparison screen (G11-G14). */
export async function getGroupHistory(range: Range): Promise<{ today: string; members: GroupMember[] }> {
  await requireMember();
  const supabase = await createClient();
  const today = jstDateString();
  const from = rangeStart(range, today);
  const [profiles, days, weeks] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_url").is("deactivated_at", null).order("created_at"),
    // The whole group's history passes the API's 1000-row limit within months: read it in pages.
    fetchAll((from, to) => supabase.from("daily_history").select("*").order("user_id").order("date").range(from, to)),
    fetchAll((from, to) =>
      supabase
        .from("weekly_stats")
        .select("user_id, week_end, achievement_rate, completed_days, counted_days")
        .order("user_id")
        .order("week_end")
        .range(from, to),
    ),
  ]);
  for (const result of [profiles, days, weeks]) if (result.error) throw result.error;
  const inRange = (date: string) => from === null || date >= from;

  return {
    today,
    members: profiles.data!.map((profile, index) => {
      const allDays = days.data!.filter((row) => row.user_id === profile.id).map(toDayRow);
      return {
        id: profile.id,
        name: profile.display_name,
        avatarUrl: profile.avatar_url,
        colorIndex: index,
        allDays,
        days: allDays.filter((day) => inRange(day.date)),
        weeks: weeks
          .data!.filter((week) => week.user_id === profile.id && inRange(week.week_end!))
          .map((week) => ({
            weekEnd: week.week_end!,
            rate: week.achievement_rate,
            completed: week.completed_days ?? 0,
            counted: week.counted_days ?? 0,
          })),
      };
    }),
  };
}
