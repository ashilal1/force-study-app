"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { FAILURE_CATEGORY, MEMBER_COLORS, OBJECTION_KIND, PENALTY_REASON } from "@/lib/chart-colors";

// Retrospective charts (G3-G9, G13, G14). Data arrives aggregated from the server; these only
// draw. Each shows a short note instead of an empty chart while there's too little data.

/** "10/18" for a day or week end; "10月" for a month bucket ("YYYY-MM", long ranges). */
const shortDate = (date: string) =>
  date.length === 7 ? `${Number(date.slice(5, 7))}月` : `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

function NotEnough() {
  return <p className="m-0 py-6 text-center text-sm text-sub">まだデータが足りません</p>;
}

/** G3: weekly achievement rate, with the group average as a line. */
export function WeeklyRateChart({ weeks }: { weeks: { weekEnd: string; rate: number | null; group: number | null }[] }) {
  if (weeks.filter((week) => week.rate !== null).length < 1) return <NotEnough />;
  const config = { rate: { label: "達成率", color: "var(--chart-1)" }, group: { label: "グループ平均", color: "var(--chart-5)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-[16/9] w-full">
      <ComposedChart data={weeks.map((week) => ({ ...week, label: shortDate(week.weekEnd) }))}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis domain={[0, 100]} width={30} tickLine={false} axisLine={false} fontSize={11} unit="%" />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="rate" fill="var(--color-rate)" radius={4} label={{ position: "top", fontSize: 10 }} />
        <Line dataKey="group" stroke="var(--color-group)" strokeDasharray="4 3" dot={false} />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}

/** G4: scores on passed days with a 7-day average and the passing line. */
export function ScoreChart({ points, passing }: { points: { date: string; score: number }[]; passing: number }) {
  if (points.length < 2) return <NotEnough />;
  const data = points.map((point, index) => {
    const window = points.slice(Math.max(0, index - 6), index + 1);
    return { label: shortDate(point.date), score: point.score, avg: Math.round(window.reduce((sum, p) => sum + p.score, 0) / window.length) };
  });
  const config = { score: { label: "点数", color: "var(--chart-1)" }, avg: { label: "7 日平均", color: "var(--chart-3)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-[16/9] w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis domain={[0, 100]} width={30} tickLine={false} axisLine={false} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ReferenceLine y={passing} stroke="var(--red)" strokeDasharray="4 3" label={{ value: `合格 ${passing}`, fontSize: 10, position: "insideTopRight" }} />
        <Line dataKey="score" stroke="var(--color-score)" dot={{ r: 3 }} />
        <Line dataKey="avg" stroke="var(--color-avg)" dot={false} strokeWidth={2} />
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  );
}

/** G5: minutes from declaring to submitting, one bar per day. */
export function ElapsedChart({ points }: { points: { date: string; minutes: number }[] }) {
  if (points.length < 2) return <NotEnough />;
  const config = { minutes: { label: "経過時間（分）", color: "var(--chart-3)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-[16/9] w-full">
      <BarChart data={points.map((point) => ({ label: shortDate(point.date), minutes: point.minutes }))}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis width={34} tickLine={false} axisLine={false} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="minutes" fill="var(--color-minutes)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}

/** G6: how many submissions in each hour of the day. */
export function HourChart({ hours }: { hours: number[] }) {
  if (hours.length < 2) return <NotEnough />;
  const counts = Array.from({ length: 24 }, (_, hour) => ({ hour: `${hour}`, count: hours.filter((h) => h === hour).length }));
  const config = { count: { label: "提出回数", color: "var(--chart-4)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-[16/9] w-full">
      <BarChart data={counts}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={10} interval={2} unit="時" />
        <YAxis allowDecimals={false} width={24} tickLine={false} axisLine={false} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}

/** G7: penalties per week stacked by reason, with the running total as a line. */
export function PenaltyChart({ rows }: { rows: { weekEnd: string; reason: string; points: number }[] }) {
  if (rows.length === 0) return <p className="m-0 py-6 text-center text-sm text-sub">ペナルティはまだありません</p>;
  const reasons = [...new Set(rows.map((row) => row.reason))];
  const weeks = [...new Set(rows.map((row) => row.weekEnd))].sort();
  const sumFor = (weekEnd: string, reason?: string) =>
    rows.filter((row) => row.weekEnd === weekEnd && (!reason || row.reason === reason)).reduce((sum, row) => sum + row.points, 0);
  const data = weeks.reduce<Record<string, string | number>[]>((list, weekEnd) => {
    const entry: Record<string, string | number> = { label: shortDate(weekEnd) };
    for (const reason of reasons) entry[reason] = sumFor(weekEnd, reason);
    entry.total = Number(list.at(-1)?.total ?? 0) + sumFor(weekEnd);
    return [...list, entry];
  }, []);
  const config: ChartConfig = { total: { label: "累計", color: "var(--ink)" } };
  for (const reason of reasons) config[reason] = { label: PENALTY_REASON[reason]?.label ?? reason, color: PENALTY_REASON[reason]?.color ?? "var(--sub)" };
  return (
    <ChartContainer config={config} className="aspect-[16/10] w-full">
      <ComposedChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis width={40} tickLine={false} axisLine={false} fontSize={11} unit="円" />
        <ChartTooltip content={<ChartTooltipContent />} />
        {reasons.map((reason) => (
          <Bar key={reason} dataKey={reason} stackId="penalty" fill={`var(--color-${reason})`} />
        ))}
        <Line dataKey="total" stroke="var(--color-total)" dot={{ r: 2 }} />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}

/** G8: why days were missed. */
export function FailureReasonChart({ categories }: { categories: string[] }) {
  if (categories.length === 0) return <p className="m-0 py-6 text-center text-sm text-sub">未達成はまだありません</p>;
  const data = Object.entries(FAILURE_CATEGORY)
    .map(([key, label]) => ({ label, count: categories.filter((category) => category === key).length }))
    .filter((row) => row.count > 0);
  const config = { count: { label: "回数", color: "var(--chart-2)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="w-full" style={{ height: 48 + data.length * 36 }}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis type="category" dataKey="label" width={130} tickLine={false} axisLine={false} fontSize={12} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} label={{ position: "right", fontSize: 11 }} />
      </BarChart>
    </ChartContainer>
  );
}

/** G9: objections per month, stacked by kind. */
export function ObjectionChart({ rows }: { rows: { month: string; kind: string }[] }) {
  if (rows.length === 0) return <p className="m-0 py-6 text-center text-sm text-sub">指摘や却下はまだありません</p>;
  const kinds = [...new Set(rows.map((row) => row.kind))];
  const months = [...new Set(rows.map((row) => row.month))].sort();
  const data = months.map((month) => {
    const entry: Record<string, string | number> = { label: `${Number(month.slice(5, 7))}月` };
    for (const kind of kinds) entry[kind] = rows.filter((row) => row.month === month && row.kind === kind).length;
    return entry;
  });
  const config: ChartConfig = {};
  for (const kind of kinds) config[kind] = { label: OBJECTION_KIND[kind]?.label ?? kind, color: OBJECTION_KIND[kind]?.color ?? "var(--sub)" };
  return (
    <ChartContainer config={config} className="aspect-[16/9] w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis allowDecimals={false} width={24} tickLine={false} axisLine={false} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {kinds.map((kind) => (
          <Bar key={kind} dataKey={kind} stackId="objection" fill={`var(--color-${kind})`} />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}

/** G13: weekly achievement rate per member. */
export function MemberRateChart({
  members,
  weeks,
}: {
  members: { id: string; name: string }[];
  weeks: ({ weekEnd: string } & Record<string, number | string | null>)[];
}) {
  const withData = weeks.filter((week) => members.some((member) => typeof week[member.id] === "number"));
  if (withData.length < 2) return <NotEnough />;
  const config: ChartConfig = {};
  members.forEach((member, index) => (config[member.id] = { label: member.name, color: MEMBER_COLORS[index % MEMBER_COLORS.length] }));
  return (
    <ChartContainer config={config} className="aspect-[16/10] w-full">
      <LineChart data={weeks.map((week) => ({ ...week, label: shortDate(week.weekEnd) }))}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis domain={[0, 100]} width={30} tickLine={false} axisLine={false} fontSize={11} unit="%" />
        <ChartTooltip content={<ChartTooltipContent />} />
        {members.map((member) => (
          <Line key={member.id} dataKey={member.id} stroke={`var(--color-${member.id})`} dot={{ r: 2 }} connectNulls />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  );
}

/** G14: penalty ranking as horizontal bars. */
export function RankingChart({ rows }: { rows: { name: string; points: number }[] }) {
  if (rows.every((row) => row.points === 0)) return <p className="m-0 py-6 text-center text-sm text-sub">ペナルティはまだありません</p>;
  const config = { points: { label: "ペナルティ", color: "var(--chart-2)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="w-full" style={{ height: 40 + rows.length * 36 }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 48 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} fontSize={12} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="points" fill="var(--color-points)" radius={4} label={{ position: "right", fontSize: 11, formatter: (v: unknown) => `${Number(v).toLocaleString()}円` }} />
      </BarChart>
    </ChartContainer>
  );
}
