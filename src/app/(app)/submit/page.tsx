import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PageLoading } from "@/components/app/page-loading";
import { actionButtonVariants } from "@/components/brand/action-button";
import { Countdown } from "@/components/brand/countdown";
import { Sticker } from "@/components/brand/sticker";
import { JudgeKarte } from "@/components/submit/judge-karte";
import { RejudgeButton } from "@/components/submit/rejudge-button";
import { SubmitForm } from "@/components/submit/submit-form";
import { getMakeupBoard } from "@/lib/makeup";
import { createClient } from "@/lib/supabase/server";
import { formatJstDateTime, formatJstDay } from "@/lib/time";
import { getTodayBoard } from "@/lib/today";

export const metadata: Metadata = { title: "提出 | Commit or Treat" };

/** `?makeup=1` submits for the running makeup session (補習, F8b) instead of a study day. */
export default function SubmitPage({ searchParams }: PageProps<"/submit">) {
  return (
    <div className="grid gap-5">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">振り返り提出</h1>
      <Suspense fallback={<PageLoading />}>
        <Submit searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** What this page needs of a study day or a makeup session. */
type Target = {
  id: string;
  date: string;
  status: string;
  declaration: string;
  passphrase: string;
  target_end_time: string;
  revision_due_at: string | null;
  revised_at: string | null;
  makeup: boolean;
};

async function findTarget(makeup: boolean): Promise<{ target: Target | null; userId: string; now: number }> {
  if (makeup) {
    const [{ me, now }, board] = await Promise.all([getTodayBoard(), getMakeupBoard()]);
    const session = board.active;
    return {
      userId: me.id,
      now,
      target: session && {
        id: session.id,
        date: session.date,
        status: session.status,
        declaration: session.declaration,
        passphrase: session.passphrase,
        target_end_time: session.targetEndTime,
        revision_due_at: session.revisionDueAt,
        revised_at: session.revisedAt,
        makeup: true,
      },
    };
  }
  const { me, now } = await getTodayBoard();
  // Yesterday's day while it is still open (ADR-032), otherwise today's.
  const log = me.previous?.status === "pending" ? me.previous : me.state.kind === "declared" ? me.state.log : null;
  return {
    userId: me.id,
    now,
    target: log && {
      id: log.id,
      date: log.date,
      status: log.status,
      declaration: log.declaration!,
      passphrase: log.passphrase!,
      target_end_time: log.target_end_time!,
      revision_due_at: log.revision_due_at,
      revised_at: log.revised_at,
      makeup: false,
    },
  };
}

type Submission = {
  id: string;
  attempt_no: number | null;
  status: string;
  image_paths: string[];
  learned_text: string | null;
  struggled_text: string | null;
  ai_score: number | null;
  ai_passphrase_found: boolean | null;
  ai_feedback: string | null;
  judge_error: string | null;
  elapsed_minutes: number | null;
  submitted_at: string;
  unverified_at: string | null;
};

async function Submit({ searchParams }: Pick<PageProps<"/submit">, "searchParams">) {
  const makeup = (await searchParams).makeup === "1";
  const { target: log, userId, now } = await findTarget(makeup);
  if (!log && makeup) {
    return (
      <Sticker className="grid gap-3 px-4 py-4">
        <b>提出できる補習はありません</b>
        <span className="text-sm font-medium">補習の画面で、先に補習を宣言してください。</span>
        <Link href="/makeup" className={actionButtonVariants({ tone: "tape" })}>
          補習の画面へ
        </Link>
      </Sticker>
    );
  }
  if (!log) {
    return (
      <Sticker className="grid gap-3 px-4 py-4">
        <b>今日はまだ提出できません</b>
        <span className="text-sm font-medium">先に今日の宣言をしてください。</span>
        <Link href="/declare" className={actionButtonVariants({ tone: "tape" })}>
          宣言する
        </Link>
      </Sticker>
    );
  }

  const supabase = await createClient();
  const [{ data: settings, error: settingsError }, { data: submissions, error }] = await Promise.all([
    supabase.from("group_settings").select("max_attempts").single(),
    supabase
      .from("submissions")
      .select(
        "id, attempt_no, status, image_paths, learned_text, struggled_text, ai_score, ai_passphrase_found, ai_feedback, judge_error, elapsed_minutes, submitted_at, unverified_at",
      )
      .eq("study_log_id", log.id)
      .eq("kind", "regular")
      .order("submitted_at", { ascending: false }),
  ]);
  if (settingsError) throw settingsError;
  if (error) throw error;

  const photos = await signedUrls(submissions.flatMap((submission) => submission.image_paths));
  const used = submissions.filter((submission) => submission.status !== "error").length;
  const attemptsLeft = Math.max(0, settings.max_attempts - used);
  const open = submissions.find((submission) => submission.status === "judging" || submission.status === "error");
  const beforeDeadline = now < new Date(log.target_end_time).getTime();
  const declareHref = log.makeup ? "/makeup" : "/declare";

  return (
    <>
      <Sticker tone="tape" shadow="sm" className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <span className="text-sm font-bold">
          {log.makeup ? "補習" : `${formatJstDay(log.date)} の分`} ・ 締切 {formatJstDateTime(log.target_end_time)}
        </span>
        <span className="font-en text-xl">
          あと <Countdown until={log.target_end_time} />
        </span>
      </Sticker>

      {log.status === "passed" || log.status === "completed" ? (
        <Sticker tone="mint" className="grid gap-1 px-4 py-3">
          <b>合格しました</b>
          <span className="text-sm font-medium">
            {log.status === "completed"
              ? log.makeup
                ? "補習を 1 回返しました。おつかれさま。"
                : "達成が確定しました。おつかれさま。"
              : log.makeup
                ? "ほかのメンバーが「怪しい」を押さなければ、補習を 1 回返したことになります。"
                : "ほかのメンバーが「怪しい」を押さなければ、そのまま達成で確定します。"}
          </span>
        </Sticker>
      ) : open ? (
        <Sticker className="grid gap-3 px-4 py-4">
          <b>{open.status === "judging" ? "判定中です" : "判定できませんでした"}</b>
          <span className="text-sm font-medium">
            {open.status === "judging"
              ? "結果が出ないときは、下のボタンでもう一度判定してください。"
              : "AI の判定でエラーが起きました（混雑など）。この提出は回数に数えません。"}
          </span>
          <RejudgeButton submissionId={open.id} />
        </Sticker>
      ) : log.status !== "pending" ? null : !beforeDeadline ? (
        <Sticker className="grid gap-1 border-red px-4 py-3">
          <b className="text-red">提出締切を過ぎました</b>
          <span className="text-sm font-medium">
            {log.makeup ? "この補習は数えられません。別の日にもう一度宣言してください。" : "合格できなかった日は、あとで理由を申告します。"}
          </span>
        </Sticker>
      ) : attemptsLeft === 0 ? (
        <Sticker className="grid gap-1 border-red px-4 py-3">
          <b className="text-red">{log.makeup ? "この補習の提出回数を使い切りました" : "この日の提出回数を使い切りました"}</b>
          <span className="text-sm font-medium">
            <Link href={declareHref} className="font-bold underline">
              {log.makeup ? "補習の画面" : "宣言の画面"}
            </Link>
            {log.makeup ? "で「できなかった」を押して、別の日にもう一度宣言してください。" : "で「できなかった」を押して、理由を申告してください。"}
          </span>
        </Sticker>
      ) : log.revision_due_at && !log.revised_at ? (
        <Sticker className="grid gap-1 border-red px-4 py-3">
          <b className="text-red">宣言の書き直しが先です</b>
          <span className="text-sm font-medium">
            提出はできますが、判定は書き直したあとの宣言で行います。先に
            <Link href={declareHref} className="font-bold underline">
              書き直し
            </Link>
            を済ませましょう。
          </span>
        </Sticker>
      ) : null}

      {log.status === "pending" && beforeDeadline && attemptsLeft > 0 && !open ? (
        <SubmitForm
          goal={log.declaration}
          passphrase={log.passphrase}
          attemptsLeft={attemptsLeft}
          live={{ logId: log.id, userId, date: log.date }}
          goalLabel={log.makeup ? "補習の宣言" : undefined}
        />
      ) : null}

      {submissions.length > 0 ? (
        <section className="grid gap-4">
          <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">これまでの提出</h2>
          {submissions.map((submission) => (
            <SubmissionResult
              key={submission.id}
              submission={submission}
              photos={submission.image_paths.map((path) => photos.get(path)).filter((url) => url !== undefined)}
              attemptsLeft={attemptsLeft}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}

function SubmissionResult({
  submission,
  photos,
  attemptsLeft,
}: {
  submission: Submission;
  photos: string[];
  attemptsLeft: number;
}) {
  return (
    <div className="grid gap-3">
      <p className="m-0 text-sm font-bold">
        {submission.attempt_no} 回目 ・ {formatJstDateTime(submission.submitted_at)} に提出
      </p>
      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
              <Sticker shadow="sm" className="aspect-square overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage */}
                <img src={url} alt="提出した写真" className="size-full object-cover" />
              </Sticker>
            </a>
          ))}
        </div>
      ) : null}
      {submission.status === "passed" || submission.status === "rejected" ? (
        <JudgeKarte
          result={{
            score: submission.ai_score ?? 0,
            passed: submission.status === "passed",
            passphraseFound: Boolean(submission.ai_passphrase_found),
            elapsedMinutes: submission.elapsed_minutes ?? 0,
            feedback: submission.ai_feedback ?? "",
            disputeWindowEndsAt: null,
            attemptsLeft,
            unverified: submission.unverified_at !== null,
            hideFooter: submission.status === "passed" || attemptsLeft === 0,
          }}
        />
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer font-bold">振り返りを見る</summary>
        <p className="m-0 mt-2">
          <b>学んだこと:</b> {submission.learned_text}
        </p>
        <p className="m-0 mt-1">
          <b>できなかったこと:</b> {submission.struggled_text}
        </p>
      </details>
    </div>
  );
}

/** Signed URLs (1 hour) for evidence photos; members may read the bucket through RLS. */
async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("study-evidence").createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  const urls = new Map<string, string>();
  for (const item of data) if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  return urls;
}
