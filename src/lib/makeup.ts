import "server-only";
import { cache } from "react";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jstDateString } from "@/lib/time";
import type { Flag } from "@/lib/today";

// Makeup study (補習, F8b), read through RLS. A session is a study_logs row with is_makeup; what
// is owed comes from makeup_debts through the makeup_summary view. The RPCs enforce every rule;
// this only decides what /makeup, the todo list and the member cards offer.

export type MakeupBalance = {
  owed: number;
  trialOwed: number;
  /** Paid back: confirmed sessions. */
  completed: number;
  /** Passed, still in the 「怪しい」 window (already counted as paid back). */
  reviewing: number;
  /** Declared and not passed yet. */
  open: number;
  remaining: number;
  overdue: number;
  nextDueAt: string | null;
};

export type MakeupSession = {
  id: string;
  userId: string;
  date: string;
  status: string;
  declaration: string;
  originalDeclaration: string | null;
  passphrase: string;
  declaredAt: string;
  targetEndTime: string;
  revisionDueAt: string | null;
  revisedAt: string | null;
  disputeWindowEndsAt: string | null;
  flags: Flag[];
  /** Regular submissions so far (Gemini errors excluded) and the latest one's state. */
  attempts: number;
  latest: { status: string; score: number | null } | null;
  passedScore: number | null;
  dispute: string | null;
};

export type MakeupDebt = {
  id: string;
  reason: "slack_streak" | "overdue";
  count: number;
  waived: string | null;
  dueAt: string;
  createdAt: string;
  /** The study day that made it (P9). */
  date: string | null;
  /** That day's declaration, if it had one: the default for the session (F8b). */
  declaration: string | null;
  periodEnd: string | null;
};

export type MakeupBoard = {
  /** The group uses makeup study (group_settings.makeup_since). */
  enabled: boolean;
  /** Server time when read (ms). */
  now: number;
  settings: { makeupHours: number; maxAttempts: number; flagWindowHours: number };
  balance: MakeupBalance;
  debts: MakeupDebt[];
  /** The viewer's running session (declared, or passed and in the 「怪しい」 window). */
  active: MakeupSession | null;
  /** The viewer already declared a session today (one a day). */
  declaredToday: boolean;
  /** The viewer may declare a session now. */
  canDeclare: boolean;
  /** The viewer's earlier sessions, newest first. */
  history: MakeupSession[];
  /** Everyone else's running sessions (to flag them). */
  others: (MakeupSession & { name: string; canFlag: boolean })[];
  /** Remaining sessions per member, for the dashboard. */
  remainingByMember: Map<string, { remaining: number; overdue: number }>;
};

const EMPTY: MakeupBalance = { owed: 0, trialOwed: 0, completed: 0, reviewing: 0, open: 0, remaining: 0, overdue: 0, nextDueAt: null };

export const getMakeupBoard = cache(async (): Promise<MakeupBoard> => {
  const me = await requireMember();
  const supabase = await createClient();
  const today = jstDateString();

  const [settings, summaries, debts, sessions, profiles] = await Promise.all([
    supabase.from("group_settings").select("makeup_since, makeup_hours, max_attempts, flag_window_hours").single(),
    supabase.from("makeup_summary").select("*"),
    supabase
      .from("makeup_debts")
      .select("id, reason, count, waived, due_at, created_at, period_end, study_logs(date, declaration)")
      .eq("user_id", me.id)
      .order("due_at")
      .order("created_at"),
    supabase
      .from("study_logs")
      .select(
        "id, user_id, date, status, declaration, original_declaration, passphrase, declared_at, target_end_time, revision_due_at, revised_at, dispute_window_ends_at",
      )
      .eq("is_makeup", true)
      .or(`user_id.eq.${me.id},status.in.(pending,passed)`)
      .order("declared_at", { ascending: false })
      .limit(60),
    supabase.from("profiles").select("id, display_name").is("deactivated_at", null),
  ]);
  for (const result of [settings, summaries, debts, sessions, profiles]) if (result.error) throw result.error;

  const ids = sessions.data!.map((session) => session.id);
  const [flags, submissions, disputes] = ids.length
    ? await Promise.all([
        supabase.from("declaration_flags").select("study_log_id, flagger_id, comment, created_at").in("study_log_id", ids).order("created_at"),
        supabase
          .from("submissions")
          .select("study_log_id, status, ai_score, submitted_at")
          .in("study_log_id", ids)
          .eq("kind", "regular")
          .order("submitted_at"),
        supabase.from("submission_disputes").select("study_log_id, status").in("study_log_id", ids),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  for (const result of [flags, submissions, disputes]) if (result.error) throw result.error;

  const names = new Map(profiles.data!.map((profile) => [profile.id, profile.display_name]));
  const now = Date.now();
  const toSession = (row: NonNullable<typeof sessions.data>[number]): MakeupSession => {
    const mine = submissions.data!.filter((submission) => submission.study_log_id === row.id);
    const latest = mine.at(-1);
    return {
      id: row.id,
      userId: row.user_id,
      date: row.date,
      status: row.status,
      declaration: row.declaration ?? "",
      originalDeclaration: row.original_declaration,
      passphrase: row.passphrase ?? "",
      declaredAt: row.declared_at!,
      targetEndTime: row.target_end_time!,
      revisionDueAt: row.revision_due_at,
      revisedAt: row.revised_at,
      disputeWindowEndsAt: row.dispute_window_ends_at,
      attempts: mine.filter((submission) => submission.status !== "error").length,
      latest: latest ? { status: latest.status, score: latest.ai_score } : null,
      passedScore: mine.find((submission) => submission.status === "passed")?.ai_score ?? null,
      dispute: disputes.data!.find((dispute) => dispute.study_log_id === row.id)?.status ?? null,
      flags: flags
        .data!.filter((flag) => flag.study_log_id === row.id)
        .map((flag) => ({
          flaggerId: flag.flagger_id,
          flaggerName: names.get(flag.flagger_id) ?? "メンバー",
          comment: flag.comment,
          createdAt: flag.created_at,
        })),
    };
  };
  const all = sessions.data!.map(toSession);
  const running = (session: MakeupSession) =>
    session.status === "pending" ||
    (session.status === "passed" &&
      (session.dispute === "resending" ||
        session.dispute === "final_review" ||
        (session.disputeWindowEndsAt !== null && now < new Date(session.disputeWindowEndsAt).getTime())));

  const summary = summaries.data!.find((row) => row.user_id === me.id);
  const balance: MakeupBalance = summary
    ? {
        owed: summary.owed ?? 0,
        trialOwed: summary.trial_owed ?? 0,
        completed: summary.completed ?? 0,
        reviewing: summary.reviewing ?? 0,
        open: summary.open ?? 0,
        remaining: summary.remaining ?? 0,
        overdue: summary.overdue ?? 0,
        nextDueAt: summary.next_due_at,
      }
    : EMPTY;

  const mine = all.filter((session) => session.userId === me.id);
  const active = mine.find(running) ?? null;
  const declaredToday = mine.some((session) => session.date === today);
  const enabled = settings.data!.makeup_since !== null;
  const flagWindowHours = settings.data!.flag_window_hours;

  return {
    enabled,
    now,
    settings: { makeupHours: settings.data!.makeup_hours, maxAttempts: settings.data!.max_attempts, flagWindowHours },
    balance,
    debts: debts.data!.map((debt) => ({
      id: debt.id,
      reason: debt.reason as MakeupDebt["reason"],
      count: debt.count,
      waived: debt.waived,
      dueAt: debt.due_at,
      createdAt: debt.created_at,
      date: debt.study_logs?.date ?? null,
      declaration: debt.study_logs?.declaration ?? null,
      periodEnd: debt.period_end,
    })),
    active,
    declaredToday,
    canDeclare: balance.remaining - balance.open > 0 && !declaredToday,
    history: mine.filter((session) => session !== active),
    others: all
      .filter((session) => session.userId !== me.id && running(session))
      .map((session) => ({
        ...session,
        name: names.get(session.userId) ?? "メンバー",
        canFlag:
          session.status === "pending" &&
          !session.revisedAt &&
          now <= new Date(session.declaredAt).getTime() + flagWindowHours * 3_600_000 &&
          now < new Date(session.targetEndTime).getTime() &&
          !session.flags.some((flag) => flag.flaggerId === me.id),
      })),
    remainingByMember: new Map(
      summaries.data!.map((row) => [row.user_id!, { remaining: row.remaining ?? 0, overdue: row.overdue ?? 0 }]),
    ),
  };
});

/**
 * The declaration to start the next session from (F8b): the oldest debt not yet covered by a
 * session, if its study day had a declaration (a day without one leaves the session free).
 */
export function suggestedDeclaration(board: MakeupBoard): string | null {
  let covered = board.balance.completed + board.balance.reviewing + board.balance.open;
  for (const debt of board.debts) {
    if (debt.waived !== null) continue;
    if (covered >= debt.count) {
      covered -= debt.count;
      continue;
    }
    return debt.declaration;
  }
  return null;
}
