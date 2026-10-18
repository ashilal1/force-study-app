import Link from "next/link";
import { completedShade, DAY_KIND, type DayKind } from "@/lib/chart-colors";
import { addDays, weekStartOf, formatJstDay } from "@/lib/time";
import { cn } from "@/lib/utils";

export type CalendarDay = { date: string; kind: DayKind; finalScore: number | null; studyLogId: string | null };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * G2: a wall calendar — 日〜土 across the top, one row per week. Color plus a symbol, so it reads
 * without color too; each square shows its date and opens that day's detail when there is a
 * record. With `month` it shows that month (‹ › to move, `hrefFor` builds the links); without,
 * the weeks the given days cover (the weekly review page).
 */
export function AchievementCalendar({
  days,
  month,
  hrefFor,
}: {
  days: CalendarDay[];
  /** "YYYY-MM" to show (already checked by the page with pickMonth). */
  month?: string;
  hrefFor?: (month: string) => string;
}) {
  if (days.length === 0) return <p className="m-0 text-sm text-sub">まだ記録がありません</p>;
  const byDate = new Map(days.map((day) => [day.date, day]));
  const firstDate = month ? `${month}-01` : days[0].date;
  const lastDate = month ? addDays(`${nextMonth(month)}-01`, -1) : days.at(-1)!.date;
  const weeks: string[][] = [];
  for (let start = weekStartOf(firstDate); start <= lastDate; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  const firstMonth = days[0].date.slice(0, 7);
  const lastMonth = days.at(-1)!.date.slice(0, 7);

  return (
    <div className="grid max-w-md gap-2">
      {month && hrefFor ? (
        <div className="flex items-center justify-between gap-2">
          <MonthLink href={month > firstMonth ? hrefFor(previousMonth(month)) : null}>‹ 前の月</MonthLink>
          <span className="font-en text-xl">
            {Number(month.slice(0, 4))}年{Number(month.slice(5, 7))}月
          </span>
          <MonthLink href={month < lastMonth ? hrefFor(nextMonth(month)) : null}>次の月 ›</MonthLink>
        </div>
      ) : null}
      <div className="grid grid-cols-7 gap-1 text-center text-[0.7rem] font-bold text-sub">
        {WEEKDAYS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid gap-1">
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 gap-1">
            {week.map((date, index) => (
              <Cell
                key={date}
                date={date}
                day={byDate.get(date)}
                showMonth={!month && (index === 0 || date.endsWith("-01"))}
                outside={month !== undefined && !date.startsWith(month)}
              />
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

const previousMonth = (month: string) => addDays(`${month}-01`, -1).slice(0, 7);
const nextMonth = (month: string) => addDays(`${month}-01`, 32).slice(0, 7);

/** Validates a ?month= value against the days on record; defaults to the latest month. */
export function pickMonth(value: unknown, days: CalendarDay[]): string | undefined {
  if (days.length === 0) return undefined;
  const first = days[0].date.slice(0, 7);
  const last = days.at(-1)!.date.slice(0, 7);
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return last;
  return value < first || value > last ? last : value;
}

function MonthLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const pill = "shrink-0 rounded-full border-2 px-3 py-1 text-xs font-bold";
  if (!href) return <span className={`${pill} border-ink/20 text-sub/50`}>{children}</span>;
  return (
    <Link href={href} scroll={false} className={`${pill} border-ink bg-card shadow-[2px_2px_0_var(--ink)]`}>
      {children}
    </Link>
  );
}

/**
 * The group calendar (G12) uses four colors so a week of several people reads at a glance:
 * done, couldn't (missed / no declaration / invalidated), in progress, and rest. The day's page
 * has the details.
 */
export const GROUP_MARKS = [
  { label: "達成", symbol: "✓", className: "bg-mint", kinds: ["completed"] },
  { label: "できなかった", symbol: "✕", className: "bg-red text-white", kinds: ["missed", "no_declaration", "invalidated"] },
  { label: "進行中", symbol: "…", className: "bg-tape", kinds: ["pending"] },
  { label: "休み", symbol: "・", className: "bg-muted text-sub", kinds: ["rest", "leave"] },
] as const satisfies { label: string; symbol: string; className: string; kinds: readonly DayKind[] }[];

const groupMark = (kind: DayKind) => GROUP_MARKS.find((mark) => (mark.kinds as readonly DayKind[]).includes(kind));

/** A mark for one member's day in the group calendar (G12). */
export function DayMark({ date, day }: { date: string; day: CalendarDay | undefined }) {
  const mark = day ? groupMark(day.kind) : undefined;
  if (!day || !mark) {
    return (
      <span aria-hidden className="grid size-7 place-items-center rounded-lg border-2 border-dashed border-ink/25 text-sub/50 md:size-10">
        ・
      </span>
    );
  }
  const title = `${formatJstDay(date)} ${DAY_KIND[day.kind].label}${day.finalScore !== null ? ` ${day.finalScore}点` : ""}`;
  const square = (
    <span
      title={title}
      aria-label={title}
      className={cn(
        "grid size-7 place-items-center rounded-lg border-2 border-ink text-sm leading-none font-bold shadow-[2px_2px_0_var(--ink)] md:size-10 md:text-lg",
        mark.className,
      )}
    >
      {mark.symbol}
    </span>
  );
  return day.studyLogId ? (
    <Link href={`/logs/${day.studyLogId}`} className="inline-grid">
      {square}
    </Link>
  ) : (
    square
  );
}

function Cell({
  date,
  day,
  showMonth = false,
  outside = false,
}: {
  date: string;
  day: CalendarDay | undefined;
  showMonth?: boolean;
  /** A day of the neighbouring month in a month view: left blank. */
  outside?: boolean;
}) {
  if (outside) return <span aria-hidden className="aspect-square" />;
  const month = Number(date.slice(5, 7));
  const dayOfMonth = Number(date.slice(8, 10));
  // Days before joining or still to come: a faint outline keeps the week's shape.
  if (!day) {
    return (
      <span aria-hidden className="relative aspect-square rounded-[6px] border border-dashed border-ink/25">
        <span className="absolute top-0.5 left-1 text-[0.6rem] text-sub/70">{showMonth ? `${month}/${dayOfMonth}` : dayOfMonth}</span>
      </span>
    );
  }

  const style = day.kind === "completed" ? completedShade(day.finalScore) : DAY_KIND[day.kind].className;
  const title = `${formatJstDay(date)} ${DAY_KIND[day.kind].label}${day.finalScore !== null ? ` ${day.finalScore}点` : ""}`;
  const cell = (
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
    <Link href={`/logs/${day.studyLogId}`} className="grid">
      {cell}
    </Link>
  ) : (
    cell
  );
}
