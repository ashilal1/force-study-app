"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { judgeSubmission, type JudgeOutcome } from "@/lib/judging";
import { dispatchAfterResponse } from "@/lib/notify";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";

// Submissions (F4b) and AI judgement (F5). The browser uploads the compressed photos to Storage
// (RLS: own folder only), then records the submission here, then asks for the judgement.

const submissionSchema = z.object({
  logId: z.uuid(),
  imagePaths: z.array(z.string().max(200)).min(1).max(3),
  thumbPath: z.string().max(200).nullable(),
  learned: z.string().trim().min(1, "学んだことを書いてください").max(2000),
  struggled: z.string().trim().min(1, "できなかったことを書いてください").max(2000),
  rating: z.number().int().min(1).max(5),
});

export async function createSubmission(
  input: z.input<typeof submissionSchema>,
): Promise<{ submissionId: string } | { error: string }> {
  const member = await requireMember();
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  const { data: event, error } = await createAdminClient().rpc("create_submission", {
    p_user_id: member.id,
    p_study_log_id: parsed.data.logId,
    p_image_paths: parsed.data.imagePaths,
    // Generated types mark every argument non-null; the function accepts a missing thumbnail.
    p_thumb_path: parsed.data.thumbPath as string,
    p_learned: parsed.data.learned,
    p_struggled: parsed.data.struggled,
    p_self_rating: parsed.data.rating,
  });
  if (error) {
    const message = rpcErrorMessage(error);
    if (!message) console.error("create_submission failed", error);
    return { error: message ?? GENERIC_ERROR };
  }

  dispatchAfterResponse(event);
  return { submissionId: event.submission_id! };
}

/** Judges (or re-judges after an error) one of the member's own submissions. */
export async function judgeMySubmission(submissionId: string): Promise<JudgeOutcome | { status: "forbidden" }> {
  const member = await requireMember();
  if (!z.uuid().safeParse(submissionId).success) return { status: "forbidden" };
  const { data } = await createAdminClient().from("submissions").select("user_id").eq("id", submissionId).maybeSingle();
  if (!data || data.user_id !== member.id) return { status: "forbidden" };

  const outcome = await judgeSubmission(submissionId);
  refresh();
  return outcome;
}
