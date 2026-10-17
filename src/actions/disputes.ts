"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { dispatchAfterResponse } from "@/lib/notify";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors } from "@/lib/validation/profile";
import type { FormState } from "./declarations";

// 「怪しい」 on a passed submission (F5b): flag, resend evidence, withdraw, final review.

const flagSchema = z.object({
  logId: z.uuid(),
  comment: z.string().trim().min(1, "どこが怪しいのか書いてください").max(300, "300 文字以内にしてください"),
});

export async function flagSubmission(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values = { logId: String(formData.get("logId") ?? ""), comment: String(formData.get("comment") ?? "") };
  const parsed = flagSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { data: event, error } = await createAdminClient().rpc("flag_submission", {
    p_flagger_id: member.id,
    p_study_log_id: parsed.data.logId,
    p_comment: parsed.data.comment,
  });
  if (error) return { errors: { form: messageFor(error) }, values };
  dispatchAfterResponse(event);
  refresh();
  return { done: true };
}

const resendSchema = z.object({
  logId: z.uuid(),
  imagePaths: z.array(z.string().max(200)).min(1).max(3),
  thumbPath: z.string().max(200).nullable(),
  explanation: z.string().trim().min(1, "何を送り直したのか説明してください").max(1000),
});

/** Records resent evidence; the browser then asks for its judgement (judgeMySubmission). */
export async function resendEvidence(
  input: z.input<typeof resendSchema>,
): Promise<{ submissionId: string } | { error: string }> {
  const member = await requireMember();
  const parsed = resendSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  const { data: submission, error } = await createAdminClient().rpc("resend_evidence", {
    p_user_id: member.id,
    p_study_log_id: parsed.data.logId,
    p_image_paths: parsed.data.imagePaths,
    p_thumb_path: parsed.data.thumbPath as string,
    p_explanation: parsed.data.explanation,
  });
  if (error) return { error: messageFor(error) };
  return { submissionId: submission.id };
}

export async function withdrawFlag(logId: string): Promise<{ error?: string }> {
  const member = await requireMember();
  if (!z.uuid().safeParse(logId).success) return { error: GENERIC_ERROR };
  const { data: events, error } = await createAdminClient().rpc("withdraw_flag", {
    p_flagger_id: member.id,
    p_study_log_id: logId,
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

export async function reviewDispute(input: z.input<typeof reviewSchema>): Promise<{ error?: string }> {
  const member = await requireMember();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: GENERIC_ERROR };
  const { data: events, error } = await createAdminClient().rpc("cast_review", {
    p_reviewer_id: member.id,
    p_subject_type: "dispute",
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
  if (!message) console.error("dispute rpc failed", error);
  return message ?? GENERIC_ERROR;
}
