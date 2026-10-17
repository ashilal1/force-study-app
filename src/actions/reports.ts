"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { dispatchAfterResponse } from "@/lib/notify";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormState } from "./declarations";

// Reason reports for a missed day (F6) and reviews of excuses (F7).

const reportSchema = z.object({
  logId: z.uuid(),
  category: z.enum(["unrealistic", "slacked", "sudden_plan", "other"], { error: "理由を選んでください" }),
  text: z.string().max(2000, "2000 文字以内にしてください"),
});

export async function fileReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values = {
    logId: String(formData.get("logId") ?? ""),
    category: String(formData.get("category") ?? ""),
    text: String(formData.get("text") ?? ""),
  };
  const parsed = reportSchema.safeParse(values);
  if (!parsed.success) return { errors: { form: parsed.error.issues[0]?.message ?? GENERIC_ERROR }, values };

  const { data: events, error } = await createAdminClient().rpc("file_failure_report", {
    p_user_id: member.id,
    p_study_log_id: parsed.data.logId,
    p_category: parsed.data.category,
    p_text: parsed.data.text,
  });
  if (error) {
    const message = rpcErrorMessage(error);
    if (!message) console.error("file_failure_report failed", error);
    return { errors: { form: message ?? GENERIC_ERROR }, values };
  }
  dispatchAfterResponse(events);
  refresh();
  return { done: true };
}

const reviewSchema = z.object({
  logId: z.uuid(),
  verdict: z.enum(["accept", "reject"]),
  comment: z.string().trim().max(300).optional(),
});

export async function reviewExcuse(input: z.input<typeof reviewSchema>): Promise<{ error?: string }> {
  const member = await requireMember();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: GENERIC_ERROR };
  const { data: events, error } = await createAdminClient().rpc("cast_review", {
    p_reviewer_id: member.id,
    p_subject_type: "excuse",
    p_subject_id: parsed.data.logId,
    p_verdict: parsed.data.verdict,
    p_comment: parsed.data.comment ?? "",
  });
  if (error) {
    const message = rpcErrorMessage(error);
    if (!message) console.error("excuse review failed", error);
    return { error: message ?? GENERIC_ERROR };
  }
  dispatchAfterResponse(events);
  refresh();
  return {};
}
