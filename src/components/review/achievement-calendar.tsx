import Link from "next/link";
import { completedShade, DAY_KIND, type DayKind } from "@/lib/chart-colors";
import { addDays, weekStartOf, formatJstDay } from "@/lib/time";
import { cn } from "@/lib/utils";

export type CalendarDay = { date: string; kind: DayKind; finalScore: number | null; studyLogId: string | null };

/**
 * G2: one square per day, weeks as columns (like GitHub's contribution graph). Color plus a
 * symbol, so it reads without color too. Squares with a record open that day's detail.
 */
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function AchievementCalendar({ days, compact = false }: { days: CalendarDay[]; compact?: boolean }) {
  if (days.length === 0) return <p className="m-0 text-sm text-sub">まだ記録がありません</p>;
  const byDate = new Map(days.map((day) => [day.date, day]));
  const first = weekStartOf(days[0].date);
  const last = days.at(-1)!.date;
  const weeks: string[][] = [];
  for (let start = first; start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid grid-flow-col gap-1" style={{ gridTemplateRows: compact ? "repeat(7, 1fr)" : "auto repeat(7, 1fr)" }}>
        {compact ? null : (
          <div className="contents">
            <span />
            {WEEKDAYS.map((label) => (
              <span key={label} className="grid size-6 place-items-center text-[0.65rem] font-bold text-sub">
                {label}
              </span>
            ))}
          </div>
        )}
        {weeks.map((week) => (
          <div key={week[0]} className="contents">
            {compact ? null : <span className="text-center text-[0.6rem] text-sub">{Number(week[0].slice(8, 10)) <= 7 ? `${Number(week[0].slice(5, 7))}月` : ""}</span>}
            {week.map((date) => {
              const day = byDate.get(date);
              // Days before joining or still to come: a faint outline keeps the week's shape.
              if (!day) {
                return (
                  <span
                    key={date}
                    aria-hidden
                    className={cn("rounded-[4px] border border-dashed border-ink/25", compact ? "size-4" : "size-6")}
                  />
                );
              }
              const style = day.kind === "completed" ? completedShade(day.finalScore) : DAY_KIND[day.kind].className;
              const title = `${formatJstDay(date)} ${DAY_KIND[day.kind].label}${day.finalScore !== null ? ` ${day.finalScore}点` : ""}`;
              const cell = (
                <span
                  title={title}
                  aria-label={title}
                  className={cn(
                    "grid place-items-center rounded-[4px] border-[1.5px] border-ink font-bold leading-none",
                    compact ? "size-4 text-[0.55rem]" : "size-6 text-[0.7rem]",
                    style,
                  )}
                >
                  {DAY_KIND[day.kind].symbol}
                </span>
              );
              return day.studyLogId ? (
                <Link key={date} href={`/logs/${day.studyLogId}`}>
                  {cell}
                </Link>
              ) : (
                <span key={date}>{cell}</span>
              );
            })}
          </div>
        ))}
      </div>
      {compact ? null : (
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[0.7rem]">
          {(["completed", "missed", "no_declaration", "rest", "pending", "none"] as DayKind[]).map((kind) => (
            <li key={kind} className="flex items-center gap-1">
              <span className={cn("grid size-3.5 place-items-center rounded-[3px] border border-ink text-[0.5rem]", DAY_KIND[kind].className)}>
                {DAY_KIND[kind].symbol}
              </span>
              {DAY_KIND[kind].label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
