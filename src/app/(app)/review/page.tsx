import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PageLoading } from "@/components/app/page-loading";
import { Avatar } from "@/components/brand/avatar";
import { GroupCalendar, pickWeek } from "@/components/review/group-calendar";
import { MemberRateChart } from "@/components/review/charts";
import { RangeTabs } from "@/components/review/range-tabs";
import { RankingSwitch } from "@/components/review/ranking-switch";
import { FAILURE_CATEGORY } from "@/lib/chart-colors";
import { getGroupHistory } from "@/lib/history";
import { parseRange, summarize } from "@/lib/stats";

export const metadata: Metadata = { title: "振り返り | Commit or Treat" };

export default function ReviewPage({ searchParams }: PageProps<"/review">) {
  return (
    <div data-wide className="grid grid-cols-1 gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">みんなの振り返り</h1>
        <Link href="/search" className="text-sm font-bold underline underline-offset-2">
          記録を検索 →
        </Link>
      </div>
      <Suspense fallback={<PageLoading />}>
        <Review searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Review({ searchParams }: Pick<PageProps<"/review">, "searchParams">) {
  const query = await searchParams;
  const range = parseRange(query.range);
  const { today, members } = await getGroupHistory(range);
  const weekStart = (() => {
    const at = new Date(`${today}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() - at.getUTCDay());
    return at.toISOString().slice(0, 10);
  })();
  const monthStart = `${today.slice(0, 8)}01`;

  const calendarMembers = members.map((member) => ({
    id: member.id,
    name: member.name,
    avatarUrl: member.avatarUrl,
    colorIndex: member.colorIndex,
    days: member.allDays,
  }));
  const rows = members.map((member) => ({ member, summary: summarize(member.days, member.allDays) }));
  const weekEnds = [...new Set(members.flatMap((member) => member.weeks.map((week) => week.weekEnd)))].sort();
  const sum = (member: (typeof members)[number], from: string | null) =>
    member.allDays.filter((day) => from === null || day.date >= from).reduce((total, day) => total + day.penaltyPoints, 0);

  return (
    <>
      <RangeTabs basePath="/review" current={range} />

      <section className="grid gap-2.5">
        <h2 className="m-0 font-heading text-[1.15rem] leading-tight font-normal">メンバー比較</h2>
        <div className="overflow-x-auto rounded-[12px] border-[2.5px] border-ink bg-card">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-ink text-left">
                <th className="px-2 py-1.5">メンバー</th>
                <th className="px-2 py-1.5">達成率</th>
                <th className="px-2 py-1.5">連続（最長）</th>
                <th className="px-2 py-1.5">平均点</th>
                <th className="px-2 py-1.5">ペナルティ</th>
                <th className="px-2 py-1.5">未達成の内訳</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .sort((a, b) => (b.summary.rate ?? -1) - (a.summary.rate ?? -1))
                .map(({ member, summary }) => {
                  const reasons = member.days.flatMap((day) => (day.failureCategory ? [day.failureCategory] : []));
                  const breakdown = Object.entries(FAILURE_CATEGORY)
                    .map(([key, label]) => [label, reasons.filter((reason) => reason === key).length] as const)
                    .filter(([, count]) => count > 0)
                    .map(([label, count]) => `${label} ${count}`)
                    .join("・");
                  return (
                    <tr key={member.id} className="border-b border-dashed border-ink/40 last:border-0">
                      <td className="px-2 py-1.5">
                        <Link href={`/members/${member.id}?range=${range}`} className="flex items-center gap-1.5 font-bold underline">
                          <Avatar name={member.name} src={member.avatarUrl} colorIndex={member.colorIndex} className="size-6 border-2 text-xs" />
                          {member.name}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 font-en">{summary.rate === null ? "−" : `${summary.rate}%`}</td>
                      <td className="px-2 py-1.5 font-en">
                        {summary.streak.current}（{summary.streak.best}）
                      </td>
                      <td className="px-2 py-1.5 font-en">{summary.avgScore ?? "−"}</td>
                      <td className="px-2 py-1.5 font-en">{summary.penalty.toLocaleString()}円</td>
                      <td className="px-2 py-1.5">{breakdown || "−"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-x-10">
        <section className="grid min-w-0 gap-2.5 lg:col-span-2">
          <h2 className="m-0 font-heading text-[1.15rem] leading-tight font-normal">グループのカレンダー</h2>
          <p className="m-0 text-xs text-sub">1 週間ずつの毎日の結果です。マスを押すとその日の詳細へ。</p>
          <GroupCalendar
            today={today}
            members={calendarMembers}
            week={pickWeek(query.week, today, calendarMembers)}
            hrefFor={(week) => `/review?${new URLSearchParams({ range, week })}`}
          />
        </section>

        <section className="grid gap-2.5">
          <h2 className="m-0 font-heading text-[1.15rem] leading-tight font-normal">週ごとの達成率</h2>
          <MemberRateChart
            members={members.map((member) => ({ id: member.id, name: member.name }))}
            weeks={weekEnds.map((weekEnd) => {
              const entry: { weekEnd: string } & Record<string, number | string | null> = { weekEnd };
              for (const member of members) entry[member.id] = member.weeks.find((week) => week.weekEnd === weekEnd)?.rate ?? null;
              return entry;
            })}
          />
        </section>

        <section className="grid gap-2.5">
          <h2 className="m-0 font-heading text-[1.15rem] leading-tight font-normal">ペナルティランキング</h2>
          <RankingSwitch
            rows={members.map((member) => ({
              name: member.name,
              week: sum(member, weekStart),
              month: sum(member, monthStart),
              all: sum(member, null),
            }))}
          />
        </section>
      </div>
    </>
  );
}
