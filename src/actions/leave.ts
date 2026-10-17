"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { dispatchAfterResponse } from "@/lib/notify";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors } from "@/lib/validation/profile";
import type { FormState } from "./declarations";

// Leave (F2b): ask, withdraw or end early, and review others' requests.

const requestSchema = z
  .object({
    start: z.iso.date({ error: "開始日を選んでください" }),
    end: z.iso.date({ error: "終了日を選んでください" }),
    reason: z.string().trim().min(1, "理由を書いてください").max(1000, "1000 文字以内にしてください"),
  })
  .refine((value) => value.end >= value.start, { path: ["end"], error: "終了日は開始日以降にしてください" });

export async function requestLeave(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values = {
    start: String(formData.get("start") ?? ""),
    end: String(formData.get("end") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  };
  const parsed = requestSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { data: events, error } = await createAdminClient().rpc("request_leave", {
    p_user_id: member.id,
    p_start: parsed.data.start,
    p_end: parsed.data.end,
    p_reason: parsed.data.reason,
  });
  if (error) return { errors: { form: messageFor(error) }, values };

  dispatchAfterResponse(events);
  refresh();
  return { done: true };
}

export async function cancelLeave(leaveRequestId: string): Promise<{ error?: string }> {
  const member = await requireMember();
  if (!z.uuid().safeParse(leaveRequestId).success) return { error: GENERIC_ERROR };
  const { data: event, error } = await createAdminClient().rpc("cancel_leave", {
    p_user_id: member.id,
    p_leave_request_id: leaveRequestId,
  });
  if (error) return { error: messageFor(error) };
  dispatchAfterResponse(event);
  refresh();
  return {};
}

const reviewSchema = z.object({
  leaveRequestId: z.uuid(),
  verdict: z.enum(["accept", "reject"]),
  comment: z.string().trim().max(300).optional(),
});

export async function reviewLeave(input: z.input<typeof reviewSchema>): Promise<{ error?: string }> {
  const member = await requireMember();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: GENERIC_ERROR };
  const { data: events, error } = await createAdminClient().rpc("cast_review", {
    p_reviewer_id: member.id,
    p_subject_type: "leave",
    p_subject_id: parsed.data.leaveRequestId,
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
  if (!message) console.error("leave rpc failed", error);
  return message ?? GENERIC_ERROR;
}
