// The numbers on the intro lecture's cards (F15): this group's settings and the member's own trial
// and day, not the defaults /guide shows. Pure so the dev preview can feed it sample values.
import { isInTrial } from "@/lib/members";
import { formatJstDateTime, jstDateString } from "@/lib/time";
import type { Tables } from "@/types/database";

export const INTRO_SETTINGS =
  "declaration_cutoff, first_declaration_reminder, last_declaration_reminder, penalty_no_declaration, penalty_slacked, passing_score, max_attempts, flag_window_hours, dispute_window_hours, settlement_weekday, settlement_time, rest_days_per_week, slack_streak_threshold, makeup_per_streak" as const;

export type IntroSettings = Pick<
  Tables<"group_settings">,
  | "declaration_cutoff"
  | "first_declaration_reminder"
  | "last_declaration_reminder"
  | "penalty_no_declaration"
  | "penalty_slacked"
  | "passing_score"
  | "max_attempts"
  | "flag_window_hours"
  | "dispute_window_hours"
  | "settlement_weekday"
  | "settlement_time"
  | "rest_days_per_week"
  | "slack_streak_threshold"
  | "makeup_per_streak"
>;

export type IntroData = {
  declarationCutoff: string;
  /** When the declaration reminders go out to whoever hasn't declared ("07:00 と 11:00"). */
  reminderTime: string;
  noDeclarationYen: number;
  slackedYen: number;
  passingScore: number;
  maxAttempts: number;
  flagHours: number;
  disputeHours: number;
  settlement: string;
  restDaysPerWeek: number;
  /** Null when makeup study is turned off for the group. */
  makeup: { streak: number; sessions: number } | null;
  /** When the trial ends ("10/25(日) 00:00"), or null for no trial (a second membership). */
  trialEndsAt: string | null;
  /** Whether today's declaration can still be made. */
  canDeclareToday: boolean;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const hhmm = (time: string) => time.slice(0, 5);

export function buildIntro(settings: IntroSettings, trialEndsAt: string, now: Date = new Date()): IntroData {
  const cutoff = new Date(`${jstDateString(now)}T${settings.declaration_cutoff}+09:00`);
  return {
    declarationCutoff: hhmm(settings.declaration_cutoff),
    reminderTime: `${hhmm(settings.first_declaration_reminder)} と ${hhmm(settings.last_declaration_reminder)}`,
    noDeclarationYen: settings.penalty_no_declaration,
    slackedYen: settings.penalty_slacked,
    passingScore: settings.passing_score,
    maxAttempts: settings.max_attempts,
    flagHours: settings.flag_window_hours,
    disputeHours: settings.dispute_window_hours,
    settlement: `${WEEKDAYS[settings.settlement_weekday] ?? "土"}曜 ${hhmm(settings.settlement_time)}`,
    restDaysPerWeek: settings.rest_days_per_week,
    makeup:
      settings.makeup_per_streak > 0
        ? { streak: settings.slack_streak_threshold, sessions: settings.makeup_per_streak }
        : null,
    trialEndsAt: isInTrial(trialEndsAt, now) ? formatJstDateTime(trialEndsAt) : null,
    canDeclareToday: now < cutoff,
  };
}
