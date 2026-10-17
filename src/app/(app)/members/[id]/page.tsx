import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLoading } from "@/components/app/page-loading";
import { Avatar } from "@/components/brand/avatar";
import { Sticker } from "@/components/brand/sticker";
import { AchievementCalendar } from "@/components/review/achievement-calendar";
import {
  ElapsedChart,
  FailureReasonChart,
  HourChart,
  ObjectionChart,
  PenaltyChart,
  ScoreChart,
  WeeklyRateChart,
} from "@/components/review/charts";
import { LogTable } from "@/components/review/log-table";
import { RangeTabs } from "@/components/review/range-tabs";
import { StatCards } from "@/components/review/stat-cards";
import { DAY_KIND, OBJECTION_KIND } from "@/lib/chart-colors";
import { getMemberHistory } from "@/lib/history";
import { parseRange, RANGES, summarize } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { formatJstDateTime, formatJstDay, jstDateString } from "@/lib/time";

export const metadata: Metadata = { title: "振り返り | Commit or Treat" };

export default function MemberPage({ params, searchParams }: PageProps<"/members/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Member params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Member({ params, searchParams }: Pick<PageProps<"/members/[id]">, "params" | "searchParams">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const range = parseRange(query.range);
  const history = /^[0-9a-f-]{36}$/.test(id) ? await getMemberHistory(id, range) : null;
  if (!history) notFound();

  const supabase = await createClient();
  const { data: settings } = await supabase.from("group_settings").select("passing_score").single();
  const { member, days, allDays } = history;
  const rangeLabel = RANGES.find((option) => option.value === range)!.label;
  const summary = summarize(days, allDays);
  const groupRate = new Map(history.groupWeeks.map((week) => [week.weekEnd, week.rate]));

  return (
    <div className="grid gap-6">
      <header className="flex items-center gap-3">
        <Avatar name={member.name} src={member.avatarUrl} colorIndex={member.colorIndex} />
        <div className="min-w-0">
          <h1 className="m-0 truncate font-heading text-[1.4rem] leading-tight font-normal">{member.name} さんの振り返り</h1>
          <Link href="/review" className="text-xs font-bold underline underline-offset-2">
            みんなと比べる →
          </Link>
        </div>
      </header>

      <RangeTabs basePath={`/members/${member.id}`} current={range} />

      <StatCards summary={summary} label={rangeLabel} />

      <Section title="達成カレンダー">
        <AchievementCalendar days={days} />
      </Section>

      <Section title="週ごとの達成率">
        <WeeklyRateChart weeks={history.weeks.map((week) => ({ weekEnd: week.weekEnd, rate: week.rate, group: groupRate.get(week.weekEnd) ?? null }))} />
      </Section>

      <Section title="点数の推移">
        <ScoreChart
          points={days.flatMap((day) => (day.kind === "completed" && day.finalScore !== null ? [{ date: day.date, score: day.finalScore }] : []))}
          passing={settings?.passing_score ?? 70}
        />
      </Section>

      <Section title="宣言から提出までの時間">
        <ElapsedChart
          points={days.flatMap((day) => (day.elapsedMinutes !== null ? [{ date: day.date, minutes: day.elapsedMinutes }] : []))}
        />
      </Section>

      <Section title="提出した時間帯">
        <HourChart hours={days.flatMap((day) => (day.submittedHour === null ? [] : [day.submittedHour]))} />
      </Section>

      <Section title="ペナルティ（週ごと・理由別）">
        <PenaltyChart rows={history.penalties} />
      </Section>

      <Section title="未達成の理由">
        <FailureReasonChart categories={days.flatMap((day) => (day.failureCategory ? [day.failureCategory] : []))} />
      </Section>

      <Section title="受けた指摘・却下">
        <ObjectionChart
          rows={history.objections.map((row) => ({ month: jstDateString(new Date(row.occurredAt)).slice(0, 7), kind: row.kind }))}
        />
        {history.objections.length > 0 ? (
          <ul className="m-0 grid list-none gap-1.5 p-0 text-xs">
            {history.objections.slice(0, 30).map((row, index) => (
              <li key={`${row.occurredAt}-${index}`} className="rounded-[8px] border-[1.5px] border-ink bg-card px-2.5 py-1.5">
                <span className="font-bold">{OBJECTION_KIND[row.kind]?.label ?? row.kind}</span>
                <span className="text-sub">
                  {" "}
                  ・ {formatJstDateTime(row.occurredAt)}
                  {row.by ? ` ・ ${row.by}` : ""}
                </span>
                {row.reason ? <p className="m-0 mt-0.5">{row.reason}</p> : null}
                {row.studyLogId ? (
                  <Link href={`/logs/${row.studyLogId}`} className="font-bold underline">
                    その日を見る
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      {history.nextPlans.length > 0 ? (
        <Section title="次の計画の追跡">
          <ul className="m-0 grid list-none gap-2 p-0 text-sm">
            {history.nextPlans.map((row) => (
              <li key={row.studyLogId}>
                <Sticker shadow="sm" className="grid gap-1 px-3 py-2.5">
                  <span className="text-xs text-sub">{formatJstDay(row.date)} に書いた次の計画</span>
                  <p className="m-0 font-medium whitespace-pre-wrap">{row.plan}</p>
                  {row.next ? (
                    <p className="m-0 text-xs">
                      → {formatJstDay(row.next.date)} の宣言: {row.next.declaration}（{DAY_KIND[row.next.kind].symbol} {DAY_KIND[row.next.kind].label}）
                    </p>
                  ) : (
                    <p className="m-0 text-xs text-sub">→ まだ次の宣言はありません</p>
                  )}
                </Sticker>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <WeeklyReviews memberId={member.id} />

      <Section title="学習ログ">
        <LogTable rows={days} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h2 className="m-0 font-heading text-[1.15rem] leading-tight font-normal">{title}</h2>
      {children}
    </section>
  );
}

async function WeeklyReviews({ memberId }: { memberId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_reviews")
    .select("week_end, stats")
    .eq("user_id", memberId)
    .order("week_end", { ascending: false })
    .limit(12);
  if (error) throw error;
  if (data.length === 0) return null;
  return (
    <Section title="週の振り返り">
      <ul className="m-0 grid list-none gap-1.5 p-0 text-sm">
        {data.map((review) => {
          const stats = review.stats as { rate?: number | null; penalty?: number };
          return (
            <li key={review.week_end}>
              <Link href={`/members/${memberId}/weeks/${review.week_end}`} className="flex justify-between gap-2 font-bold underline">
                <span>{formatJstDay(review.week_end)} までの週</span>
                <span className="font-en">
                  {stats.rate ?? "−"}% ・ {(stats.penalty ?? 0).toLocaleString()}円
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

