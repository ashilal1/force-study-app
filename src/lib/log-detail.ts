import "server-only";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// One member's day (/logs/[id]): declaration, every submission with its photos and AI verdict,
// 「軽すぎる」 and 「怪しい」, the dispute and its final review. Read through RLS; what the viewer
// may do is derived here for the screen, the RPCs enforce it.

export type DetailSubmission = {
  id: string;
  kind: "regular" | "resend";
  attemptNo: number | null;
  status: string;
  photos: string[];
  learned: string | null;
  struggled: string | null;
  explanation: string | null;
  selfRating: number | null;
  score: number | null;
  passphraseFound: boolean | null;
  feedback: string | null;
  elapsedMinutes: number | null;
  submittedAt: string;
  /** Passed without an AI verdict (ADR-033). */
  unverified: boolean;
};

export type DetailFlag = { flaggerId: string; name: string; comment: string; createdAt: string; withdrawnAt: string | null };

export type LogDetail = {
  now: number;
  meId: string;
  owner: { id: string; name: string };
  log: {
    id: string;
    date: string;
    status: string;
    declaration: string | null;
    originalDeclaration: string | null;
    passphrase: string | null;
    declaredAt: string | null;
    targetEndTime: string | null;
    disputeWindowEndsAt: string | null;
  };
  submissions: DetailSubmission[];
  declarationFlags: { name: string; comment: string }[];
  submissionFlags: DetailFlag[];
  dispute: { status: string; resendDueAt: string; reviewDueAt: string | null } | null;
  reviews: { reviewerId: string; name: string; verdict: string | null; comment: string | null }[];
  can: { flag: boolean; withdraw: boolean; resend: boolean; review: boolean };
};

export async function getLogDetail(logId: string): Promise<LogDetail | null> {
  const me = await requireMember();
  const supabase = await createClient();
  const { data: log, error } = await supabase
    .from("study_logs")
    .select(
      "id, user_id, date, status, declaration, original_declaration, passphrase, declared_at, target_end_time, dispute_window_ends_at",
    )
    .eq("id", logId)
    .maybeSingle();
  if (error) throw error;
  if (!log) return null;

  const [profiles, submissions, declarationFlags, submissionFlags, dispute, reviews] = await Promise.all([
    supabase.from("profiles").select("id, display_name"),
    supabase
      .from("submissions")
      .select(
        "id, kind, attempt_no, status, image_paths, thumb_path, learned_text, struggled_text, explanation, self_rating, ai_score, ai_passphrase_found, ai_feedback, elapsed_minutes, submitted_at, unverified_at",
      )
      .eq("study_log_id", logId)
      .order("submitted_at"),
    supabase.from("declaration_flags").select("flagger_id, comment").eq("study_log_id", logId).order("created_at"),
    supabase
      .from("submission_flags")
      .select("flagger_id, comment, created_at, withdrawn_at")
      .eq("study_log_id", logId)
      .order("created_at"),
    supabase.from("submission_disputes").select("status, resend_due_at, review_due_at").eq("study_log_id", logId).maybeSingle(),
    supabase.from("peer_reviews").select("reviewer_id, verdict, comment").eq("subject_type", "dispute").eq("subject_id", logId),
  ]);
  for (const result of [profiles, submissions, declarationFlags, submissionFlags, dispute, reviews]) {
    if (result.error) throw result.error;
  }

  const name = (id: string) => profiles.data!.find((profile) => profile.id === id)?.display_name ?? "メンバー";
  // Originals are deleted after the retention period; the thumbnail stays forever (F12).
  const shown = (submission: { image_paths: string[]; thumb_path: string | null }) =>
    submission.image_paths.length > 0 ? submission.image_paths : submission.thumb_path ? [submission.thumb_path] : [];
  const paths = submissions.data!.flatMap(shown);
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed, error: signError } = await supabase.storage.from("study-evidence").createSignedUrls(paths, 60 * 60);
    if (signError) throw signError;
    for (const item of signed) if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }

  const now = Date.now();
  const isOwner = log.user_id === me.id;
  const flags: DetailFlag[] = submissionFlags.data!.map((flag) => ({
    flaggerId: flag.flagger_id,
    name: name(flag.flagger_id),
    comment: flag.comment,
    createdAt: flag.created_at,
    withdrawnAt: flag.withdrawn_at,
  }));
  const d = dispute.data;
  const resending = d?.status === "resending" && now < new Date(d.resend_due_at).getTime();
  const myReview = reviews.data!.find((review) => review.reviewer_id === me.id);

  return {
    now,
    meId: me.id,
    owner: { id: log.user_id, name: name(log.user_id) },
    log: {
      id: log.id,
      date: log.date,
      status: log.status,
      declaration: log.declaration,
      originalDeclaration: log.original_declaration,
      passphrase: log.passphrase,
      declaredAt: log.declared_at,
      targetEndTime: log.target_end_time,
      disputeWindowEndsAt: log.dispute_window_ends_at,
    },
    submissions: submissions.data!.map((submission) => ({
      id: submission.id,
      kind: submission.kind as "regular" | "resend",
      attemptNo: submission.attempt_no,
      status: submission.status,
      photos: shown(submission).map((path) => urls.get(path)).filter((url) => url !== undefined),
      learned: submission.learned_text,
      struggled: submission.struggled_text,
      explanation: submission.explanation,
      selfRating: submission.self_rating,
      score: submission.ai_score,
      passphraseFound: submission.ai_passphrase_found,
      feedback: submission.ai_feedback,
      elapsedMinutes: submission.elapsed_minutes,
      submittedAt: submission.submitted_at,
      unverified: submission.unverified_at !== null,
    })),
    declarationFlags: declarationFlags.data!.map((flag) => ({ name: name(flag.flagger_id), comment: flag.comment })),
    submissionFlags: flags,
    dispute: d ? { status: d.status, resendDueAt: d.resend_due_at, reviewDueAt: d.review_due_at } : null,
    reviews: reviews.data!.map((review) => ({
      reviewerId: review.reviewer_id,
      name: name(review.reviewer_id),
      verdict: review.verdict,
      comment: review.comment,
    })),
    can: {
      flag:
        !isOwner &&
        log.status === "passed" &&
        log.dispute_window_ends_at !== null &&
        now < new Date(log.dispute_window_ends_at).getTime() &&
        (!d || resending) &&
        !flags.some((flag) => flag.flaggerId === me.id),
      withdraw: resending && flags.some((flag) => flag.flaggerId === me.id && !flag.withdrawnAt),
      resend: isOwner && resending && !submissions.data!.some((submission) => submission.status === "judging"),
      review:
        d?.status === "final_review" &&
        d.review_due_at !== null &&
        now <= new Date(d.review_due_at).getTime() &&
        myReview !== undefined &&
        myReview.verdict === null,
    },
  };
}
