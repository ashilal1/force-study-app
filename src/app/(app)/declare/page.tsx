import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PageLoading } from "@/components/app/page-loading";
import { actionButtonVariants } from "@/components/brand/action-button";
import { Countdown } from "@/components/brand/countdown";
import { Pill } from "@/components/brand/pill";
import { Stamp } from "@/components/brand/stamp";
import { Sticker } from "@/components/brand/sticker";
import { DeclareForm } from "@/components/declare/declare-form";
import { FlagList } from "@/components/declare/flag-list";
import { GiveUpButton } from "@/components/declare/give-up-button";
import { PassphraseCard } from "@/components/declare/passphrase-card";
import { RestDayPlanner, type PlannerDay } from "@/components/declare/rest-day-planner";
import { ReviseForm } from "@/components/declare/revise-form";
import { getMakeupBoard } from "@/lib/makeup";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatJstDateTime, formatJstDay, formatJstTime } from "@/lib/time";
import { getTodayBoard, isOnLeave, type TodayLog } from "@/lib/today";

export const metadata: Metadata = { title: "宣言 | Commit or Treat" };

export default function DeclarePage() {
  return (
    <div className="grid gap-6">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">今日の宣言</h1>
      <Suspense fallback={<PageLoading />}>
        <Today />
      </Suspense>
      <Suspense fallback={null}>
        <MakeupLink />
      </Suspense>

      <section className="grid gap-3">
        <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">休息日</h2>
        <p className="m-0 text-sm font-medium text-sub">
          宣言しなくていい日を、明日以降で選べます（週 1 日まで。当日は変えられません）。
        </p>
        <Suspense fallback={<PageLoading />}>
          <RestDays />
        </Suspense>
        <Link href="/leave" className="text-sm font-bold underline underline-offset-2">
          テストや旅行で長く休むときは、休会を申請する →
        </Link>
      </section>
    </div>
  );
}

async function Today() {
  const { me, date, now, settings } = await getTodayBoard();
  const cutoff = new Date(`${date}T${settings.declaration_cutoff}+09:00`).toISOString();

  switch (me.state.kind) {
    case "rest":
      return <Notice title="今日は休息日です">宣言しなくて大丈夫です。しっかり休みましょう。</Notice>;
    case "leave":
      return <Notice title="休会中です">宣言も審査もお休みです。</Notice>;
    case "no_declaration":
      return (
        <Notice title="今日は宣言なしになりました" tone="red">
          {me.state.log.revision_due_at
            ? "「軽すぎる」の指摘のあと、期限までに書き直されませんでした。"
            : "宣言の締切までに宣言がありませんでした。"}
        </Notice>
      );
    case "declared":
      return <MyDeclaration log={me.state.log} now={now} />;
    case "undeclared":
      if (now >= new Date(cutoff).getTime()) {
        return (
          <Notice title="宣言の締切を過ぎました" tone="red">
            今日の宣言は {formatJstTime(cutoff)} まででした。
          </Notice>
        );
      }
      // Yesterday has to be finished first (ADR-032).
      if (me.previous && (me.previous.status === "pending" || me.previous.report === "awaiting_report")) {
        return <PreviousDay log={me.previous} cutoff={cutoff} />;
      }
      return (
        <DeclareForm
          cutoff={cutoff}
          submitBy={new Date(`${addDays(date, 1)}T${settings.declaration_cutoff}+09:00`).toISOString()}
          nextPlan={await lastNextPlan(me.id)}
        />
      );
  }
}

function MyDeclaration({ log, now }: { log: TodayLog; now: number }) {
  const revising = Boolean(log.revision_due_at && !log.revised_at && now < new Date(log.revision_due_at).getTime());
  return (
    <div className="grid gap-4">
      <Sticker className="grid gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <Pill variant="outline">宣言 {formatJstTime(log.declared_at!)}</Pill>
          <span className="text-right text-sm font-bold">
            提出締切 {formatJstDateTime(log.target_end_time!)}
            <br />
            <span className="font-en text-lg">
              あと <Countdown until={log.target_end_time!} />
            </span>
          </span>
        </div>
        <p className="m-0 text-[1.05rem] leading-snug font-bold whitespace-pre-wrap">{log.declaration}</p>
        {log.original_declaration ? (
          <p className="m-0 text-sm text-sub">
            書き直す前: <s>{log.original_declaration}</s>
          </p>
        ) : null}
        <PassphraseCard value={log.passphrase!} />
      </Sticker>

      {log.flags.length > 0 ? (
        <section className="grid gap-2">
          <div className="flex items-center gap-3">
            <Stamp tone="red" label="指摘" className="text-lg" />
            <span className="text-sm font-bold">
              {log.revised_at ? `${formatJstDateTime(log.revised_at)} に書き直しました` : "宣言が軽すぎると指摘されました"}
            </span>
          </div>
          <FlagList flags={log.flags} />
        </section>
      ) : null}

      {revising ? (
        <Sticker className="px-4 py-4">
          <ReviseForm logId={log.id} current={log.declaration!} dueAt={log.revision_due_at!} />
        </Sticker>
      ) : null}

      {log.status === "missed" ? (
        <Link href={`/reports/${log.id}`} className={actionButtonVariants({ tone: "red" })}>
          未達成でした。理由を申告する・見る
        </Link>
      ) : null}
      {log.status === "pending" ? (
        <>
          <Link href="/submit" className={actionButtonVariants({ tone: "mint" })}>
            <span>提出する</span>
            <span className="font-sans text-xs font-bold">合言葉を紙に書いて、成果物と一緒に撮る</span>
          </Link>
          {log.latest?.status !== "judging" ? <GiveUpButton logId={log.id} /> : null}
        </>
      ) : null}
    </div>
  );
}

/** Yesterday is still open or its reason is owed: finish it, then today's form appears. */
function PreviousDay({ log, cutoff }: { log: TodayLog; cutoff: string }) {
  const day = formatJstDay(log.date);
  if (log.status !== "pending") {
    return (
      <div className="grid gap-3">
        <Notice title={`${day} の分の理由を申告してください`} tone="red">
          未達成の理由を申告すると、今日の宣言ができます。今日の宣言の締切は {formatJstTime(cutoff)} です。
        </Notice>
        <Link href={`/reports/${log.id}`} className={actionButtonVariants({ tone: "red" })}>
          理由を申告する
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <Notice title={`${day} の分がまだ終わっていません`} tone="red">
        提出して合格するか、「できなかった」を押すと今日の宣言ができます。{formatJstTime(cutoff)} を過ぎると、{day}{" "}
        は未達成、今日は宣言なしになります。
      </Notice>
      <Sticker shadow="sm" className="grid gap-1 px-3.5 py-2.5">
        <small className="text-xs text-sub">{day} の宣言</small>
        <p className="m-0 text-sm font-bold whitespace-pre-wrap">{log.declaration}</p>
      </Sticker>
      {log.latest?.status === "judging" ? (
        <Notice title="AI が判定中です">結果が出るまで少し待ってください。</Notice>
      ) : (
        <>
          <Link href="/submit" className={actionButtonVariants({ tone: "mint" })}>
            {day} の分を提出する
          </Link>
          <GiveUpButton logId={log.id} />
        </>
      )}
    </div>
  );
}

/** Makeup sessions (補習) still owed: they are declared on /makeup, apart from the day. */
async function MakeupLink() {
  const { enabled, balance } = await getMakeupBoard();
  if (!enabled || balance.remaining === 0) return null;
  return (
    <Link href="/makeup" className={actionButtonVariants({ tone: balance.overdue > 0 ? "red" : "tape" })}>
      <span>補習が {balance.remaining} 回あります</span>
      <span className="font-sans text-xs font-bold">補習の画面で宣言・提出する</span>
    </Link>
  );
}

async function RestDays() {
  const { me, date, settings } = await getTodayBoard();
  const supabase = await createClient();
  const from = addDays(date, 1);
  const to = addDays(date, 14);
  const [rests, leaves] = await Promise.all([
    supabase.from("rest_days").select("date").eq("user_id", me.id).gte("date", from).lte("date", to),
    supabase
      .from("leave_requests")
      .select("user_id, start_date, end_date, approved_at, cancelled_from, status")
      .eq("user_id", me.id)
      .in("status", ["under_review", "approved"])
      .lte("start_date", to)
      .gte("end_date", from),
  ]);
  if (rests.error) throw rests.error;
  if (leaves.error) throw leaves.error;

  const days: PlannerDay[] = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(from, i);
    return {
      date: day,
      rest: rests.data.some((rest) => rest.date === day),
      // Approved or still under review: either way that day can't also be a rest day.
      leave: leaves.data.some(
        (leave) =>
          day >= leave.start_date &&
          day <= leave.end_date &&
          (leave.status === "under_review" || isOnLeave(leave, day) || leave.approved_at !== null),
      ),
    };
  });
  return <RestDayPlanner days={days} perWeek={settings.rest_days_per_week} />;
}

async function lastNextPlan(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("failure_reports")
    .select("next_plan_text")
    .eq("user_id", userId)
    .eq("category", "unrealistic")
    .order("reported_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.next_plan_text ?? null;
}

function Notice({ title, tone = "white", children }: { title: string; tone?: "white" | "red"; children: React.ReactNode }) {
  return (
    <Sticker className={tone === "red" ? "grid gap-1 border-red px-4 py-4" : "grid gap-1 px-4 py-4"}>
      <b className={tone === "red" ? "text-red" : undefined}>{title}</b>
      <span className="text-sm font-medium">{children}</span>
    </Sticker>
  );
}
