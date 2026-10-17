import "server-only";
import { cache } from "react";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jstDateString } from "@/lib/time";
import type { Tables } from "@/types/database";

// Today's board for every member (read through RLS). The RPCs enforce every rule; the derived
// flags here (on leave, can flag) only decide what the screen offers.

export type Settings = Pick<
  Tables<"group_settings">,
  | "declaration_cutoff"
  | "submit_deadline_max"
  | "flag_window_hours"
  | "revision_minutes"
  | "rest_days_per_week"
  | "min_explanation_chars"
  | "penalty_no_declaration"
  | "penalty_unrevised"
>;

export type Flag = { flaggerId: string; flaggerName: string; comment: string; createdAt: string };

export type TodayLog = Pick<
  Tables<"study_logs">,
  | "id"
  | "status"
  | "declaration"
  | "original_declaration"
  | "target_end_time"
  | "passphrase"
  | "declared_at"
  | "revision_due_at"
  | "revised_at"
> & {
  flags: Flag[];
  /** Regular submissions so far (Gemini errors excluded) and the latest one's state. */
  attempts: number;
  latest: { status: string; score: number | null } | null;
  /** Score of the passing submission, once passed. */
  passedScore: number | null;
};

export type TodayState =
  | { kind: "rest" }
  | { kind: "leave" }
  | { kind: "undeclared" }
  | { kind: "declared"; log: TodayLog }
  | { kind: "no_declaration"; log: TodayLog };

export type TodayMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  colorIndex: number;
  isMe: boolean;
  state: TodayState;
  /** The viewer may press 「軽すぎる」 on this member's declaration right now. */
  canFlag: boolean;
};

export type TodayBoard = {
  date: string;
  /** Server time when the board was read (ms). Display decisions use this, not the client clock. */
  now: number;
  settings: Settings;
  me: TodayMember;
  members: TodayMember[];
};

type LeaveRow = Pick<Tables<"leave_requests">, "user_id" | "start_date" | "end_date" | "approved_at" | "cancelled_from">;

/** Same rule as private.is_on_leave: approved before the day began, in the period, not cut short. */
export function isOnLeave(leave: LeaveRow, date: string): boolean {
  if (!leave.approved_at) return false;
  if (new Date(leave.approved_at) >= new Date(`${date}T00:00:00+09:00`)) return false;
  if (date < leave.start_date || date > leave.end_date) return false;
  return !leave.cancelled_from || date < leave.cancelled_from;
}

export const getSettings = cache(async (): Promise<Settings> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_settings")
    .select(
      "declaration_cutoff, submit_deadline_max, flag_window_hours, revision_minutes, rest_days_per_week, min_explanation_chars, penalty_no_declaration, penalty_unrevised",
    )
    .single();
  if (error) throw error;
  return data;
});

export const getTodayBoard = cache(async (): Promise<TodayBoard> => {
  const me = await requireMember();
  const supabase = await createClient();
  const date = jstDateString();

  const [settings, profiles, logs, rests, leaves] = await Promise.all([
    getSettings(),
    supabase.from("profiles").select("id, display_name, avatar_url").is("deactivated_at", null).order("created_at"),
    supabase
      .from("study_logs")
      .select(
        "id, user_id, status, declaration, original_declaration, target_end_time, passphrase, declared_at, revision_due_at, revised_at",
      )
      .eq("date", date),
    supabase.from("rest_days").select("user_id").eq("date", date),
    supabase
      .from("leave_requests")
      .select("user_id, start_date, end_date, approved_at, cancelled_from")
      .not("approved_at", "is", null)
      .lte("start_date", date)
      .gte("end_date", date),
  ]);
  for (const result of [profiles, logs, rests, leaves]) if (result.error) throw result.error;

  const logIds = logs.data!.map((log) => log.id);
  const [{ data: flags, error }, { data: submissions, error: submissionsError }] = logIds.length
    ? await Promise.all([
        supabase
          .from("declaration_flags")
          .select("study_log_id, flagger_id, comment, created_at")
          .in("study_log_id", logIds)
          .order("created_at"),
        supabase
          .from("submissions")
          .select("study_log_id, status, ai_score, submitted_at")
          .in("study_log_id", logIds)
          .eq("kind", "regular")
          .order("submitted_at"),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (error) throw error;
  if (submissionsError) throw submissionsError;

  const names = new Map(profiles.data!.map((profile) => [profile.id, profile.display_name]));
  const now = Date.now();

  const members = profiles.data!.map((profile, index): TodayMember => {
    const row = logs.data!.find((log) => log.user_id === profile.id);
    const mine = row ? submissions!.filter((submission) => submission.study_log_id === row.id) : [];
    const latest = mine.at(-1);
    const log: TodayLog | null = row
      ? {
          ...row,
          attempts: mine.filter((submission) => submission.status !== "error").length,
          latest: latest ? { status: latest.status, score: latest.ai_score } : null,
          passedScore: mine.find((submission) => submission.status === "passed")?.ai_score ?? null,
          flags: flags!
            .filter((flag) => flag.study_log_id === row.id)
            .map((flag) => ({
              flaggerId: flag.flagger_id,
              flaggerName: names.get(flag.flagger_id) ?? "メンバー",
              comment: flag.comment,
              createdAt: flag.created_at,
            })),
        }
      : null;

    let state: TodayState;
    if (log) state = log.status === "no_declaration" ? { kind: "no_declaration", log } : { kind: "declared", log };
    else if (rests.data!.some((rest) => rest.user_id === profile.id)) state = { kind: "rest" };
    else if (leaves.data!.some((leave) => leave.user_id === profile.id && isOnLeave(leave, date))) state = { kind: "leave" };
    else state = { kind: "undeclared" };

    const canFlag =
      profile.id !== me.id &&
      state.kind === "declared" &&
      state.log.status === "pending" &&
      !state.log.revised_at &&
      now <= new Date(state.log.declared_at!).getTime() + settings.flag_window_hours * 3_600_000 &&
      now < new Date(state.log.target_end_time!).getTime() &&
      !state.log.flags.some((flag) => flag.flaggerId === me.id);

    return {
      id: profile.id,
      name: profile.display_name,
      avatarUrl: profile.avatar_url,
      colorIndex: index,
      isMe: profile.id === me.id,
      state,
      canFlag,
    };
  });

  return { date, now, settings, me: members.find((member) => member.isMe)!, members };
});
