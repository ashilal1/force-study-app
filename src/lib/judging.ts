import "server-only";
import { judgeWithGemini } from "@/lib/gemini/judge";
import { dispatchAfterResponse } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";

// Runs the AI judgement for one submission: load it, fetch the photos, ask Gemini, record the
// verdict (or the error). Called right after submitting, by 「再判定」, and later by the cron tick.

export type JudgeOutcome =
  | { status: "passed" | "rejected" }
  | { status: "waiting_revision" }
  | { status: "error"; message: string }
  | { status: "closed" };

const BUCKET = "study-evidence";

export async function judgeSubmission(submissionId: string): Promise<JudgeOutcome> {
  const admin = createAdminClient();
  const { data: submission, error } = await admin
    .from("submissions")
    .select(
      "id, kind, status, image_paths, learned_text, struggled_text, explanation, self_rating, elapsed_minutes, study_logs!inner(status, declaration, passphrase, revision_due_at, revised_at)",
    )
    .eq("id", submissionId)
    .single();
  if (error) throw error;
  if (!["judging", "error"].includes(submission.status)) return { status: "closed" };

  const log = submission.study_logs;
  if (log.revision_due_at && !log.revised_at && log.status === "pending") return { status: "waiting_revision" };

  try {
    const images = await Promise.all(
      submission.image_paths.map(async (path) => {
        const { data, error: downloadError } = await admin.storage.from(BUCKET).download(path);
        if (downloadError) throw downloadError;
        return { mimeType: data.type || "image/webp", base64: Buffer.from(await data.arrayBuffer()).toString("base64") };
      }),
    );

    const verdict = await judgeWithGemini({
      kind: submission.kind as "regular" | "resend",
      declaration: log.declaration ?? "",
      passphrase: log.passphrase ?? "",
      elapsedMinutes: submission.elapsed_minutes,
      learned: submission.learned_text,
      struggled: submission.struggled_text,
      selfRating: submission.self_rating,
      explanation: submission.explanation,
      images,
    });

    const { data: events, error: recordError } = await admin.rpc("record_judgement", {
      p_submission_id: submission.id,
      p_score: verdict.score,
      p_passphrase_found: verdict.passphraseFound,
      p_feedback: verdict.feedback,
      p_model: verdict.model,
    });
    if (recordError) {
      if (recordError.message === "already_judged" || recordError.message === "not_open") return { status: "closed" };
      if (recordError.message === "revision_pending") return { status: "waiting_revision" };
      throw recordError;
    }
    dispatchAfterResponse(events);
    return { status: events[0]?.type === "judged_passed" ? "passed" : "rejected" };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error("judging failed", submissionId, message);
    await admin.rpc("record_judge_error", { p_submission_id: submissionId, p_message: message });
    return { status: "error", message };
  }
}
