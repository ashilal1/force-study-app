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
import { PassphraseCard } from "@/components/declare/passphrase-card";
import { RestDayPlanner, type PlannerDay } from "@/components/declare/rest-day-planner";
import { ReviseForm } from "@/components/declare/revise-form";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatJstDateTime, formatJstTime } from "@/lib/time";
import { getTodayBoard, isOnLeave, type TodayLog } from "@/lib/today";

export const metadata: Metadata = { title: "宣言 | Commit or Treat" };

export default function DeclarePage() {
  return (
    <div className="grid gap-6">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">今日の宣言</h1>
      <Suspense fallback={<PageLoading />}>
        <Today />
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
      return <DeclareForm cutoff={cutoff} deadlineMax={settings.submit_deadline_max.slice(0, 5)} nextPlan={await lastNextPlan(me.id)} />;
  }
}

function MyDeclaration({ log, now }: { log: TodayLog; now: number }) {
  const revising = Boolean(log.revision_due_at && !log.revised_at && now < new Date(log.revision_due_at).getTime());
  return (
    <div className="grid gap-4">
      <Sticker className="grid gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <Pill variant="outline">宣言 {formatJstTime(log.declared_at!)}</Pill>
          <span className="font-en text-lg">
            締切 {formatJstTime(log.target_end_time!)}（あと <Countdown until={log.target_end_time!} />）
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

      {log.status === "pending" ? (
        <Link href="/submit" className={actionButtonVariants({ tone: "mint" })}>
          <span>提出する</span>
          <span className="font-sans text-xs font-bold">合言葉を紙に書いて、成果物と一緒に撮る</span>
        </Link>
      ) : null}
    </div>
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
