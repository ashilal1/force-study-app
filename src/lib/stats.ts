// Numbers for the retrospective (G1, G11) from daily_history rows. Pure, so it can be tested.

import type { DayKind } from "./chart-colors";

export type HistoryDay = {
  date: string;
  kind: DayKind;
  finalScore: number | null;
  elapsedMinutes: number | null;
  penaltyPoints: number;
  trialPoints: number;
};

/** Days that had to be studied: they count toward the achievement rate. */
const COUNTED: DayKind[] = ["completed", "missed", "invalidated", "no_declaration"];
/** Days that neither extend nor break a streak. */
const NEUTRAL: DayKind[] = ["rest", "leave", "pending", "none"];

export function achievementRate(days: HistoryDay[]): number | null {
  const counted = days.filter((day) => COUNTED.includes(day.kind));
  if (counted.length === 0) return null;
  return Math.round((100 * counted.filter((day) => day.kind === "completed").length) / counted.length);
}

/** Consecutive achieved days, skipping rest/leave/unsettled days. `days` in date order. */
export function streaks(days: HistoryDay[]): { current: number; best: number } {
  let run = 0;
  let best = 0;
  for (const day of days) {
    if (NEUTRAL.includes(day.kind)) continue;
    run = day.kind === "completed" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current: run, best };
}

const average = (values: number[]) =>
  values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

export type Summary = {
  rate: number | null;
  streak: { current: number; best: number };
  avgScore: number | null;
  avgElapsedMinutes: number | null;
  penalty: number;
  trialPenalty: number;
};

/** G1-style summary over `days` (already limited to the period). Streaks use `allDays`. */
export function summarize(days: HistoryDay[], allDays: HistoryDay[] = days): Summary {
  const completed = days.filter((day) => day.kind === "completed");
  return {
    rate: achievementRate(days),
    streak: streaks(allDays),
    avgScore: average(completed.flatMap((day) => (day.finalScore === null ? [] : [day.finalScore]))),
    avgElapsedMinutes: average(completed.flatMap((day) => (day.elapsedMinutes === null ? [] : [day.elapsedMinutes]))),
    penalty: days.reduce((sum, day) => sum + day.penaltyPoints, 0),
    trialPenalty: days.reduce((sum, day) => sum + day.trialPoints, 0),
  };
}

export type Range = "4w" | "3m" | "all";

export const RANGES: { value: Range; label: string }[] = [
  { value: "4w", label: "直近 4 週" },
  { value: "3m", label: "3 か月" },
  { value: "all", label: "全期間" },
];

/** First date ("YYYY-MM-DD") included in the range, counting back from `today`. */
export function rangeStart(range: Range, today: string): string | null {
  if (range === "all") return null;
  const at = new Date(`${today}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - (range === "4w" ? 27 : 89));
  return at.toISOString().slice(0, 10);
}

export function parseRange(value: unknown): Range {
  return value === "3m" || value === "all" ? value : "4w";
}

/** Long ranges read better by month: more than 16 weeks are bundled into months ("YYYY-MM"). */
export function periodKey(weekEnd: string, weekCount: number): string {
  return weekCount > 16 ? weekEnd.slice(0, 7) : weekEnd;
}

/** Achievement rate per period from completed / counted days (weeks bundled by periodKey). */
export function ratesByPeriod<T extends { weekEnd: string; completed: number; counted: number }>(
  weeks: T[],
  weekCount: number,
): Map<string, number | null> {
  const sums = new Map<string, { completed: number; counted: number }>();
  for (const week of weeks) {
    const key = periodKey(week.weekEnd, weekCount);
    const entry = sums.get(key) ?? { completed: 0, counted: 0 };
    entry.completed += week.completed;
    entry.counted += week.counted;
    sums.set(key, entry);
  }
  return new Map(
    [...sums].sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, entry.counted === 0 ? null : Math.round((100 * entry.completed) / entry.counted)]),
  );
}

