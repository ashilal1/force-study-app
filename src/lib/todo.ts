import "server-only";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTodayBoard } from "@/lib/today";

// 「あなたがやること」 (F10): everything still waiting on the viewer, soonest deadline first.
// Read through RLS; the RPCs enforce the rules when the member acts.

export type Todo = {
  key: string;
  label: string;
  detail?: string;
  /** ISO time it's due, when there is one. */
  dueAt: string | null;
  href: string;
  urgent: boolean;
};

export async function getTodos(): Promise<Todo[]> {
  const me = await requireMember();
  const board = await getTodayBoard();
  const supabase = await createClient();
  const now = board.now;
  const todos: Todo[] = [];
  const name = (id: string) => board.members.find((member) => member.id === id)?.name ?? "メンバー";
  const future = (iso: string | null) => iso !== null && new Date(iso).getTime() > now;

  // Today's own day: declare, rewrite, submit.
  const cutoff = new Date(`${board.date}T${board.settings.declaration_cutoff}+09:00`).toISOString();
  const state = board.me.state;
  if (state.kind === "undeclared" && future(cutoff)) {
    todos.push({ key: "declare", label: "今日の宣言をする", dueAt: cutoff, href: "/declare", urgent: true });
  }
  if (state.kind === "declared") {
    const log = state.log;
    if (log.revision_due_at && !log.revised_at && future(log.revision_due_at)) {
      todos.push({ key: "revise", label: "宣言を書き直す", detail: "「軽すぎる」と指摘されました", dueAt: log.revision_due_at, href: "/declare", urgent: true });
    }
    if (log.status === "pending" && future(log.target_end_time) && log.latest?.status !== "judging") {
      todos.push({ key: "submit", label: "成果物を提出する", dueAt: log.target_end_time, href: "/submit", urgent: false });
    }
  }

  const [reports, reviews, myDisputes, myFlags, settlements] = await Promise.all([
    supabase.from("failure_reports").select("study_log_id, report_due_at").eq("user_id", me.id).eq("status", "awaiting_report"),
    supabase.from("peer_reviews").select("subject_type, subject_id").eq("reviewer_id", me.id).is("verdict", null),
    supabase
      .from("submission_disputes")
      .select("study_log_id, resend_due_at, study_logs!inner(user_id)")
      .eq("status", "resending")
      .eq("study_logs.user_id", me.id),
    supabase.from("submission_flags").select("study_log_id").eq("flagger_id", me.id).is("withdrawn_at", null),
    supabase.from("settlements").select("id, debtor_id, payee_id, amount_yen, status").or(`debtor_id.eq.${me.id},payee_id.eq.${me.id}`).neq("status", "completed"),
  ]);
  for (const result of [reports, reviews, myDisputes, myFlags, settlements]) if (result.error) throw result.error;

  for (const report of reports.data!) {
    if (!future(report.report_due_at)) continue;
    todos.push({ key: `report:${report.study_log_id}`, label: "未達成の理由を申告する", dueAt: report.report_due_at, href: `/reports/${report.study_log_id}`, urgent: true });
  }

  for (const dispute of myDisputes.data!) {
    if (!future(dispute.resend_due_at)) continue;
    todos.push({ key: `resend:${dispute.study_log_id}`, label: "証拠を送り直す", detail: "「怪しい」と指摘されました", dueAt: dispute.resend_due_at, href: `/logs/${dispute.study_log_id}`, urgent: true });
  }

  // Reviews: look up each subject's deadline and owner.
  const byType = (type: string) => reviews.data!.filter((review) => review.subject_type === type).map((review) => review.subject_id);
  const [excuses, leaves, disputes, flagged] = await Promise.all([
    byType("excuse").length
      ? supabase.from("failure_reports").select("study_log_id, user_id, review_due_at").in("study_log_id", byType("excuse")).eq("status", "under_review")
      : { data: [], error: null },
    byType("leave").length
      ? supabase.from("leave_requests").select("id, user_id, review_due_at").in("id", byType("leave")).eq("status", "under_review")
      : { data: [], error: null },
    byType("dispute").length
      ? supabase
          .from("submission_disputes")
          .select("study_log_id, review_due_at, study_logs!inner(user_id)")
          .in("study_log_id", byType("dispute"))
          .eq("status", "final_review")
      : { data: [], error: null },
    myFlags.data!.length
      ? supabase
          .from("submission_disputes")
          .select("study_log_id, resend_due_at, study_logs!inner(user_id)")
          .in("study_log_id", myFlags.data!.map((flag) => flag.study_log_id))
          .eq("status", "resending")
      : { data: [], error: null },
  ]);
  for (const result of [excuses, leaves, disputes, flagged]) if (result.error) throw result.error;

  for (const excuse of excuses.data!) {
    if (!future(excuse.review_due_at)) continue;
    todos.push({ key: `excuse:${excuse.study_log_id}`, label: `${name(excuse.user_id)} さんの理由を審査する`, dueAt: excuse.review_due_at, href: `/reports/${excuse.study_log_id}`, urgent: true });
  }
  for (const leave of leaves.data!) {
    if (!future(leave.review_due_at)) continue;
    todos.push({ key: `leave:${leave.id}`, label: `${name(leave.user_id)} さんの休会を審査する`, dueAt: leave.review_due_at, href: "/leave", urgent: true });
  }
  for (const dispute of disputes.data!) {
    if (!future(dispute.review_due_at)) continue;
    todos.push({ key: `dispute:${dispute.study_log_id}`, label: `${name(dispute.study_logs.user_id)} さんの提出を最終審査する`, dueAt: dispute.review_due_at, href: `/logs/${dispute.study_log_id}`, urgent: true });
  }
  for (const dispute of flagged.data!) {
    todos.push({ key: `withdraw:${dispute.study_log_id}`, label: `${name(dispute.study_logs.user_id)} さんの送り直した証拠を確かめる`, detail: "納得したら取り下げる", dueAt: dispute.resend_due_at, href: `/logs/${dispute.study_log_id}`, urgent: false });
  }

  for (const settlement of settlements.data!) {
    if (settlement.debtor_id === me.id && settlement.status === "open") {
      todos.push({ key: `pay:${settlement.id}`, label: `${name(settlement.payee_id)} さんに ${settlement.amount_yen.toLocaleString()} 円を送る`, dueAt: null, href: "/settlements", urgent: true });
    }
    if (settlement.payee_id === me.id && settlement.status === "sent") {
      todos.push({ key: `receive:${settlement.id}`, label: `${name(settlement.debtor_id)} さんからの送金を確かめる`, dueAt: null, href: "/settlements", urgent: false });
    }
  }

  return todos.sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
}
