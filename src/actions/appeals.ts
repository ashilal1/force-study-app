"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { dispatchAfterResponse } from "@/lib/notify";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";

// Asking the members to judge a day the AI rejected every time (F5c), and their review.

const appealSchema = z.object({
  logId: z.uuid(),
  reason: z.string().trim().min(1, "なぜ合格だと思うのか書いてください").max(1000, "1000 文字以内にしてください"),
});

export async function appealJudgement(input: z.input<typeof appealSchema>): Promise<{ error?: string }> {
  const member = await requireMember();
  const parsed = appealSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  const { data: events, error } = await createAdminClient().rpc("appeal_judgement", {
    p_user_id: member.id,
    p_study_log_id: parsed.data.logId,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: messageFor(error) };
  dispatchAfterResponse(events);
  refresh();
  return {};
}

const reviewSchema = z.object({
  logId: z.uuid(),
  verdict: z.enum(["accept", "reject"]),
  comment: z.string().trim().max(300).optional(),
});

export async function reviewAppeal(input: z.input<typeof reviewSchema>): Promise<{ error?: string }> {
  const member = await requireMember();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: GENERIC_ERROR };
  const { data: events, error } = await createAdminClient().rpc("cast_review", {
    p_reviewer_id: member.id,
    p_subject_type: "appeal",
    p_subject_id: parsed.data.logId,
    p_verdict: parsed.data.verdict,
    p_comment: parsed.data.comment ?? "",
  });
  if (error) return { error: messageFor(error) };
  dispatchAfterResponse(events);
  refresh();
  return {};
}

function messageFor(error: { message: string }): string {
  const message = rpcErrorMessage(error);
  if (!message) console.error("appeal rpc failed", error);
  return message ?? GENERIC_ERROR;
}
