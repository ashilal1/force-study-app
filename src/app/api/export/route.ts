import { NextResponse, type NextRequest } from "next/server";
import { getMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jstDateString } from "@/lib/time";

// Download your own records (F12): GET /api/export?format=json|csv. Reads through RLS as the
// signed-in member; only rows about the caller are included.

export async function GET(request: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
  const supabase = await createClient();
  const me = member.id;

  const [days, logs, submissions, reports, penalties, settlements, reviews, objections] = await Promise.all([
    supabase.from("daily_history").select("*").eq("user_id", me).order("date"),
    supabase.from("study_logs").select("*").eq("user_id", me).order("date"),
    supabase.from("submissions").select("*").eq("user_id", me).order("submitted_at"),
    supabase.from("failure_reports").select("*").eq("user_id", me),
    supabase.from("penalties").select("*").eq("user_id", me).order("created_at"),
    supabase.from("settlements").select("*").or(`debtor_id.eq.${me},payee_id.eq.${me}`).order("period_end"),
    supabase.from("weekly_reviews").select("*").eq("user_id", me).order("week_end"),
    supabase.from("received_objections").select("*").eq("user_id", me).order("occurred_at"),
  ]);
  for (const result of [days, logs, submissions, reports, penalties, settlements, reviews, objections]) {
    if (result.error) return NextResponse.json({ error: "export failed" }, { status: 500 });
  }

  const stamp = jstDateString();
  if (format === "json") {
    const body = JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        member: { id: me, display_name: member.display_name },
        days: days.data,
        study_logs: logs.data,
        submissions: submissions.data,
        failure_reports: reports.data,
        penalties: penalties.data,
        settlements: settlements.data,
        weekly_reviews: reviews.data,
        received_objections: objections.data,
      },
      null,
      2,
    );
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="commit-or-treat-${stamp}.json"`,
      },
    });
  }

  // CSV: one row per day, with the reflection of the passing (or last) submission.
  const reflection = new Map<string, { learned: string; struggled: string }>();
  for (const submission of submissions.data!) {
    if (submission.kind !== "regular") continue;
    const current = reflection.get(submission.study_log_id);
    if (!current || submission.status === "passed") {
      reflection.set(submission.study_log_id, { learned: submission.learned_text ?? "", struggled: submission.struggled_text ?? "" });
    }
  }
  const header = ["日付", "結果", "宣言", "点数", "提出回数", "経過時間（分）", "ペナルティ（円）", "お試し期間（本番なら・円）", "未達成の理由", "学んだこと", "できなかったこと"];
  const rows = days.data!.map((day) => {
    const text = day.study_log_id ? reflection.get(day.study_log_id) : undefined;
    return [
      day.date,
      day.kind,
      day.declaration,
      day.final_score,
      day.attempts,
      day.elapsed_minutes,
      day.penalty_points,
      day.trial_points,
      day.failure_category,
      text?.learned,
      text?.struggled,
    ];
  });
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(`﻿${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commit-or-treat-${stamp}.csv"`,
    },
  });
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
