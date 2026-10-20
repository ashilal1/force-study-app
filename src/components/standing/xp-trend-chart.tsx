"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { RANKS, rankOf, type XpTrendPoint } from "@/lib/standing/rules";
import { formatJstDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Crown } from "./crown";
import { RANK_TONE } from "./rank-badge";

// The 28-day XP over the last 8 weeks (F14), drawn as it plays: the line runs left to right each
// time the chart scrolls into view, rank changes pop up where the line crosses a rank's border,
// and with several members (the race) the crown rides the leading line and hops when someone
// overtakes. Tapping skips to the end; dragging across shows that day's breakdown.
// Under "reduce motion" it shows the finished chart straight away.

export type XpTrendLine = { id: string; name: string; color: string; points: XpTrendPoint[] };

const W = 340;
const H = 210;
const PAD = { left: 30, right: 10, top: 16, bottom: 22 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const DURATION = 1600;

/** Rank bands behind the lines (the borders of ADR-039). */
const BANDS = [
  { id: "tensai", from: 300, to: Infinity, fill: "rgba(242, 201, 76, 0.30)" },
  { id: "yuutousei", from: 150, to: 300, fill: "rgba(174, 182, 193, 0.28)" },
  { id: "yareba-dekiru", from: 50, to: 150, fill: "rgba(169, 220, 198, 0.28)" },
  { id: "mikka-bouzu", from: -50, to: 50, fill: "transparent" },
  { id: "doushiyou-mo-nai", from: -Infinity, to: -50, fill: "rgba(70, 70, 70, 0.16)" },
] as const;
const BORDERS = [-50, 50, 150, 300];

export function XpTrendChart({ lines, race = false }: { lines: XpTrendLine[]; race?: boolean }) {
  const clipId = `xp-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [progress, setProgress] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);

  const chart = useMemo(() => layout(lines), [lines]);

  const play = () => {
    cancelAnimationFrame(frame.current);
    setScrub(null);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      setProgress(1 - (1 - t) ** 2);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };
  const finish = () => {
    cancelAnimationFrame(frame.current);
    setProgress(1);
  };

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frame.current = requestAnimationFrame(() => setProgress(1));
      return () => cancelAnimationFrame(frame.current);
    }
    // Every time it comes into view; out of view it rewinds, unseen.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) play();
        else {
          cancelAnimationFrame(frame.current);
          setProgress(0);
          setScrub(null);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, []);

  if (chart.dates.length < 2) {
    return <p className="m-0 py-6 text-center text-sm text-sub">まだ記録が足りません</p>;
  }

  const { dates, x, y } = chart;
  const n = dates.length;
  const head = progress * (n - 1);
  const headX = PAD.left + progress * PLOT_W;
  const now = chart.lines.map((line) => ({ line, value: valueAt(line, head) }));
  const leaders = race ? leadersOf(now) : [];

  const indexAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const at = ((event.clientX - rect.left) / rect.width) * W;
    return Math.max(0, Math.min(n - 1, Math.round(((at - PAD.left) / PLOT_W) * (n - 1))));
  };
  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    if (progress < 1) finish();
    setScrub(indexAt(event));
  };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || event.buttons > 0) setScrub(indexAt(event));
  };
  const onLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") setScrub(null);
  };

  const solo = chart.lines.length === 1 ? now[0] : null;
  const soloValue = solo?.value === undefined ? null : Math.round(solo.value);

  return (
    <figure className="m-0 grid gap-2">
      {solo && soloValue !== null ? (
        <div className="flex items-center gap-2">
          <span className="font-en text-2xl leading-none tabular-nums">{soloValue}</span>
          <span className="text-xs font-bold">XP</span>
          <RankPill xp={soloValue} />
        </div>
      ) : null}

      <div ref={box} className="relative w-full select-none">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full overflow-visible"
          role="img"
          aria-label={summary(chart.lines)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={headX + 0.5} height={H} />
            </clipPath>
          </defs>

          {BANDS.map((band) => {
            const top = y(Math.min(band.to, chart.hi));
            const bottom = y(Math.max(band.from, chart.lo));
            return bottom > top ? <rect key={band.id} x={PAD.left} y={top} width={PLOT_W} height={bottom - top} fill={band.fill} /> : null;
          })}
          {[0, ...BORDERS].map((value) =>
            value > chart.lo && value < chart.hi ? (
              <g key={value}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(value)}
                  y2={y(value)}
                  stroke="var(--ink)"
                  strokeOpacity={value === 0 ? 0.35 : 0.2}
                  strokeDasharray={value === 0 ? undefined : "3 3"}
                />
                <text x={PAD.left - 4} y={y(value) + 3} textAnchor="end" className="fill-sub font-en text-[10px]">
                  {value}
                </text>
              </g>
            ) : null,
          )}
          {dates.map((date, index) =>
            (n - 1 - index) % 7 === 0 ? (
              <text key={date} x={x(index)} y={H - 6} textAnchor="middle" className={cn("fill-sub text-[10px]", index < n - 1 && "font-en")}>
                {index === n - 1 ? "今日" : `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`}
              </text>
            ) : null,
          )}

          <g clipPath={`url(#${clipId})`}>
            {chart.lines.map((line) => (
              <g key={line.id}>
                <path d={line.path} fill="none" stroke={line.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                {line.points.map((point) =>
                  point.events.length > 0 ? (
                    <circle key={point.date} cx={x(point.index)} cy={y(point.xp)} r={2.2} fill="var(--card)" stroke={line.color} strokeWidth={1.5} />
                  ) : null,
                )}
              </g>
            ))}
          </g>

          {/* Rank names over the lines, with a halo so they stay readable. */}
          {BANDS.map((band) => {
            const top = y(Math.min(band.to, chart.hi));
            const bottom = y(Math.max(band.from, chart.lo));
            return bottom - top > 13 ? (
              <text
                key={band.id}
                x={PAD.left + 3}
                y={top + 10}
                stroke="var(--card)"
                strokeWidth={2.5}
                strokeLinejoin="round"
                paintOrder="stroke"
                className="pointer-events-none fill-sub text-[9.5px] font-bold"
              >
                {RANKS.find((rank) => rank.id === band.id)!.name}
              </text>
            ) : null;
          })}

          {progress < 1
            ? now.map(({ line, value }) =>
                value === undefined ? null : <circle key={line.id} cx={headX} cy={y(value)} r={4} fill={line.color} stroke="var(--ink)" strokeWidth={1.5} />,
              )
            : null}

          {scrub !== null ? (
            <g>
              <line x1={x(scrub)} x2={x(scrub)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--ink)" strokeWidth={1.2} />
              {chart.lines.map((line) => {
                const point = line.byIndex.get(scrub);
                return point ? <circle key={line.id} cx={x(scrub)} cy={y(point.xp)} r={4.5} fill={line.color} stroke="var(--ink)" strokeWidth={1.5} /> : null;
              })}
            </g>
          ) : null}
        </svg>

        {/* Where the line crossed into another rank (one member only). */}
        {solo
          ? chart.lines[0].crossings.map((crossing) =>
              head >= crossing.index ? (
                <span
                  key={crossing.index}
                  className={cn(
                    "pointer-events-none absolute -translate-x-1/2 -translate-y-[135%] animate-in rounded-full border-2 px-1.5 py-px text-[0.62rem] font-black whitespace-nowrap shadow-[1px_1px_0_var(--ink)] duration-300 zoom-in-50 fade-in-0 motion-reduce:animate-none",
                    RANK_TONE[crossing.rank.id],
                  )}
                  style={{ left: `${(x(crossing.index) / W) * 100}%`, top: `${(y(crossing.xp) / H) * 100}%` }}
                >
                  {crossing.up ? `★ ${crossing.rank.name}に！` : `↓ ${crossing.rank.name}`}
                </span>
              ) : null,
            )
          : null}

        {/* The crown rides the leader; a new leader's crown hops in. */}
        {leaders.map(({ line, value }) => (
          <span
            key={line.id}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-[120%]"
            style={{ left: `${(headX / W) * 100}%`, top: `${(y(value) / H) * 100}%` }}
          >
            <span className="block animate-[crown-hop_420ms_ease-out] motion-reduce:animate-none">
              <Crown className="w-6 drop-shadow-[1px_1px_0_var(--ink)]" title={`${line.name} が 1 位`} />
            </span>
          </span>
        ))}

        {scrub !== null ? <Breakdown chart={chart} index={scrub} race={race} /> : null}

        <div
          aria-hidden
          className="absolute inset-0 cursor-crosshair touch-pan-y"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
        />
      </div>

      {race ? (
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-xs font-bold">
          {now.map(({ line, value }) => (
            <li key={line.id} className="inline-flex items-center gap-1">
              <span aria-hidden className="inline-block h-1 w-3.5 rounded-full" style={{ background: line.color }} />
              {line.name}
              <span className="font-en tabular-nums">{value === undefined ? "−" : Math.round(value)}</span>
              {leaders.some((leader) => leader.line.id === line.id) ? <Crown className="w-3.5" /> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <figcaption className="flex items-center justify-between gap-2 text-[0.7rem] font-medium text-sub">
        <span>なぞると、その日の内訳が出ます</span>
        <button type="button" onClick={play} className="shrink-0 font-bold text-ink underline underline-offset-2">
          ▶ もう一度
        </button>
      </figcaption>
    </figure>
  );
}

/** The rank of a live value, in its colors. */
function RankPill({ xp }: { xp: number }) {
  const rank = rankOf(xp);
  return (
    <span className={cn("inline-flex rounded-full border-2 px-2 py-0.5 text-[0.72rem] font-black whitespace-nowrap", RANK_TONE[rank.id])}>
      {rank.name}
    </span>
  );
}

type Chart = ReturnType<typeof layout>;

function Breakdown({ chart, index, race }: { chart: Chart; index: number; race: boolean }) {
  const left = (chart.x(index) / W) * 100;
  const align = left > 62 ? "-translate-x-full" : left < 38 ? "" : "-translate-x-1/2";
  const date = chart.dates[index];
  const rows = chart.lines.flatMap((line) => {
    const point = line.byIndex.get(index);
    return point ? [{ line, point }] : [];
  });
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-0 z-10 grid max-w-[240px] min-w-[150px] gap-0.5 rounded-[10px] border-2 border-ink bg-card px-2.5 py-1.5 text-[0.72rem] shadow-[2px_2px_0_var(--ink)]",
        align,
      )}
      style={{ left: `${left}%` }}
    >
      <b>{formatJstDay(date)}</b>
      {race ? (
        rows
          .sort((a, b) => b.point.xp - a.point.xp)
          .map(({ line, point }) => (
            <span key={line.id} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="inline-block h-1 w-3 rounded-full" style={{ background: line.color }} />
                {line.name}
              </span>
              <b className="font-en tabular-nums">{point.xp} XP</b>
            </span>
          ))
      ) : rows[0] ? (
        <SoloBreakdown point={rows[0].point} />
      ) : null}
    </div>
  );
}

function SoloBreakdown({ point }: { point: XpTrendPoint }) {
  const items = [
    ...point.events.map((event) => ({ label: event.label, points: event.points })),
    ...(point.dropped !== 0 ? [{ label: point.dropped < 0 ? "28 日より前の分が外れた" : "28 日より前の減点が外れた", points: point.dropped }] : []),
  ];
  return (
    <>
      <span className="flex items-center justify-between gap-3">
        <b className="font-en tabular-nums">{point.xp} XP</b>
        <span className="font-bold">{rankOf(point.xp).name}</span>
      </span>
      {point.leave ? <span className="text-sub">休会（28 日に数えない日）</span> : null}
      {items.length === 0 && !point.leave ? <span className="text-sub">変化なし</span> : null}
      {items.map((item, index) => (
        <span key={index} className="flex justify-between gap-3 tabular-nums">
          <span>{item.label}</span>
          <b className={item.points < 0 ? "text-red" : undefined}>
            {item.points > 0 ? "+" : "−"}
            {Math.abs(item.points)}
          </b>
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function layout(lines: XpTrendLine[]) {
  const dates = [...new Set(lines.flatMap((line) => line.points.map((point) => point.date)))].sort();
  const indexOf = new Map(dates.map((date, index) => [date, index]));
  const values = lines.flatMap((line) => line.points.map((point) => point.xp));
  const lo = Math.min(-70, Math.min(...values, 0) - 20);
  const hi = Math.max(80, Math.max(...values, 0) + 25);
  const n = dates.length;
  const x = (index: number) => PAD.left + (n <= 1 ? PLOT_W / 2 : (index / (n - 1)) * PLOT_W);
  const y = (value: number) => PAD.top + ((hi - value) / (hi - lo)) * PLOT_H;
  return {
    dates,
    lo,
    hi,
    x,
    y,
    lines: lines.map((line) => {
      const points = line.points.map((point) => ({ ...point, index: indexOf.get(point.date)! }));
      const crossings = points.flatMap((point, at) => {
        if (at === 0) return [];
        const before = rankOf(points[at - 1].xp);
        const after = rankOf(point.xp);
        return before.id === after.id ? [] : [{ index: point.index, xp: point.xp, rank: after, up: after.min > before.min }];
      });
      return {
        ...line,
        points,
        first: points[0]?.index ?? Infinity,
        byIndex: new Map(points.map((point) => [point.index, point])),
        path: points.map((point, at) => `${at === 0 ? "M" : "L"}${x(point.index).toFixed(1)} ${y(point.xp).toFixed(1)}`).join(" "),
        // The last few, so a bumpy month doesn't bury the chart in labels.
        crossings: crossings.slice(-3),
      };
    }),
  };
}

/** A line's value at a fractional day index, or undefined before they joined. */
function valueAt(line: Chart["lines"][number], at: number): number | undefined {
  if (at < line.first) return undefined;
  const below = line.byIndex.get(Math.floor(at));
  const above = line.byIndex.get(Math.ceil(at)) ?? below;
  if (!below || !above) return below?.xp ?? above?.xp;
  return below.xp + (above.xp - below.xp) * (at - Math.floor(at));
}

/** Who wears the crown at this point: as in F14, 2+ members, not all equal, 1 XP or more. */
function leadersOf(now: { line: Chart["lines"][number]; value: number | undefined }[]) {
  const present = now.filter((entry): entry is { line: Chart["lines"][number]; value: number } => entry.value !== undefined);
  if (present.length < 2) return [];
  const values = present.map((entry) => Math.round(entry.value));
  const top = Math.max(...values);
  if (top < 1 || top === Math.min(...values)) return [];
  return present.filter((entry) => Math.round(entry.value) === top);
}

function summary(lines: Chart["lines"]): string {
  const latest = lines.map((line) => {
    const last = line.points.at(-1);
    return last ? `${line.name} ${last.xp} XP（${rankOf(last.xp).name}）` : line.name;
  });
  return `直近 8 週の XP の推移。いま ${latest.join("、")}`;
}
