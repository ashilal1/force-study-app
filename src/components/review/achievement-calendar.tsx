import Link from "next/link";
import { completedShade, DAY_KIND, type DayKind } from "@/lib/chart-colors";
import { addDays, weekStartOf, formatJstDay } from "@/lib/time";
import { cn } from "@/lib/utils";

export type CalendarDay = { date: string; kind: DayKind; finalScore: number | null; studyLogId: string | null };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * G2: a wall calendar — 日〜土 across the top, one row per week, oldest first. Color plus a
 * symbol, so it reads without color too; each square shows its date and opens that day's
 * detail when there is a record.
 */
export function AchievementCalendar({ days }: { days: CalendarDay[] }) {
  if (days.length === 0) return <p className="m-0 text-sm text-sub">まだ記録がありません</p>;
  const byDate = new Map(days.map((day) => [day.date, day]));
  const first = weekStartOf(days[0].date);
  const last = days.at(-1)!.date;
  const weeks: string[][] = [];
  for (let start = first; start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }

  return (
    <div className="grid max-w-md gap-2">
      <div className="grid grid-cols-7 gap-1 text-center text-[0.7rem] font-bold text-sub">
        {WEEKDAYS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid gap-1">
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 gap-1">
            {week.map((date, index) => (
              <Cell key={date} date={date} day={byDate.get(date)} showMonth={index === 0 || date.endsWith("-01")} />
            ))}
          </div>
        ))}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[0.7rem]">
        {(["completed", "missed", "no_declaration", "rest", "pending", "none"] as DayKind[]).map((kind) => (
          <li key={kind} className="flex items-center gap-1">
            <span className={cn("grid size-3.5 place-items-center rounded-[3px] border border-ink text-[0.5rem]", DAY_KIND[kind].className)}>
              {DAY_KIND[kind].symbol}
            </span>
            {DAY_KIND[kind].label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A small mark for one member's day (the group calendar, G12). */
export function DayMark({ date, day }: { date: string; day: CalendarDay | undefined }) {
  return <Cell date={date} day={day} compact />;
}

function Cell({
  date,
  day,
  compact = false,
  showMonth = false,
}: {
  date: string;
  day: CalendarDay | undefined;
  compact?: boolean;
  showMonth?: boolean;
}) {
  const month = Number(date.slice(5, 7));
  const dayOfMonth = Number(date.slice(8, 10));
  // Days before joining or still to come: a faint outline keeps the week's shape.
  if (!day) {
    return compact ? (
      <span aria-hidden className="size-4 rounded-[3px] border border-dashed border-ink/25" />
    ) : (
      <span aria-hidden className="relative aspect-square rounded-[6px] border border-dashed border-ink/25">
        <span className="absolute top-0.5 left-1 text-[0.6rem] text-sub/70">{showMonth ? `${month}/${dayOfMonth}` : dayOfMonth}</span>
      </span>
    );
  }

  const style = day.kind === "completed" ? completedShade(day.finalScore) : DAY_KIND[day.kind].className;
  const title = `${formatJstDay(date)} ${DAY_KIND[day.kind].label}${day.finalScore !== null ? ` ${day.finalScore}点` : ""}`;
  const cell = compact ? (
    <span
      title={title}
      aria-label={title}
      className={cn("grid size-4 place-items-center rounded-[3px] border-[1.5px] border-ink text-[0.55rem] leading-none font-bold", style)}
    >
      {DAY_KIND[day.kind].symbol}
    </span>
  ) : (
    <span
      title={title}
      aria-label={title}
      className={cn("relative grid aspect-square place-items-center rounded-[6px] border-[1.5px] border-ink text-sm leading-none font-bold", style)}
    >
      <span className="absolute top-0.5 left-1 text-[0.6rem] font-medium">{showMonth ? `${month}/${dayOfMonth}` : dayOfMonth}</span>
      {DAY_KIND[day.kind].symbol}
    </span>
  );
  return day.studyLogId ? (
    <Link href={`/logs/${day.studyLogId}`} className={compact ? undefined : "grid"}>
      {cell}
    </Link>
  ) : (
    cell
  );
}
