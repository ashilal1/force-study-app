import Link from "next/link";
import { Avatar } from "@/components/brand/avatar";
import type { CalendarDay } from "@/components/review/achievement-calendar";
import { DayMark } from "@/components/review/achievement-calendar";
import { addDays, weekStartOf } from "@/lib/time";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

type Member = { id: string; name: string; avatarUrl: string | null; colorIndex: number; days: CalendarDay[] };

/**
 * G12: who did what on which day, one week at a time (this week first; ‹ › to go back and forth):
 * 日〜土 with dates across the top, a row per member. Longer trends are in the weekly chart.
 * `hrefFor(weekStart)` builds the link for another week, keeping the page's other parameters.
 */
export function GroupCalendar({
  today,
  members,
  week,
  hrefFor,
}: {
  today: string;
  members: Member[];
  /** Sunday of the week to show (already checked by the page). */
  week: string;
  hrefFor: (weekStart: string) => string;
}) {
  if (members.length === 0) return null;
  const byMember = new Map(members.map((member) => [member.id, new Map(member.days.map((day) => [day.date, day]))]));
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const current = weekStartOf(today);
  const earliest = earliestWeek(members, current);
  const previous = week > earliest ? addDays(week, -7) : null;
  const next = week < current ? addDays(week, 7) : null;
  const label = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

  return (
    <div className="grid w-full max-w-xl gap-2">
      <div className="flex items-center justify-between gap-2">
        <WeekLink href={previous ? hrefFor(previous) : null}>‹ 前の週</WeekLink>
        <span className="grid justify-items-center leading-none">
          <span className="font-en text-xl md:text-2xl">
            {label(week)}〜{Number(dates[6].slice(8, 10))}
          </span>
          {week === current ? <span className="mt-1 text-[0.65rem] font-bold text-sub">今週</span> : null}
        </span>
        <WeekLink href={next ? hrefFor(next) : null}>次の週 ›</WeekLink>
      </div>
      <table className="w-full table-fixed border-collapse text-center text-xs">
        <thead>
          <tr>
            <th className="w-[6.5rem] md:w-[9rem]" />
            {dates.map((date, i) => (
              <th key={date} className={date === today ? "pb-1 font-black" : "pb-1 font-bold text-sub"}>
                <span className="block text-[0.65rem]">{WEEKDAYS[i]}</span>
                <span className="block text-[0.7rem]">{Number(date.slice(8, 10))}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <td className="py-1.5 pr-1 text-left">
                <Link href={`/members/${member.id}`} className="flex min-w-0 items-center gap-1.5 font-bold underline">
                  <Avatar name={member.name} src={member.avatarUrl} colorIndex={member.colorIndex} className="size-6 shrink-0 border-2 text-[0.6rem]" />
                  <span className="truncate">{member.name}</span>
                </Link>
              </td>
              {dates.map((date) => (
                <td key={date} className="py-1.5">
                  <span className="inline-grid">
                    <DayMark date={date} day={byMember.get(member.id)!.get(date)} />
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The first week anyone has a day in (the browsing stops there). */
function earliestWeek(members: Member[], fallback: string): string {
  const first = members.flatMap((member) => member.days.map((day) => day.date)).sort()[0];
  return first ? weekStartOf(first) : fallback;
}

/** Validates a ?week= value: a Sunday between the first week and this week, else this week. */
export function pickWeek(value: unknown, today: string, members: Member[]): string {
  const current = weekStartOf(today);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || weekStartOf(value) !== value) return current;
  return value < earliestWeek(members, current) || value > current ? current : value;
}

function WeekLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const pill = "shrink-0 rounded-full border-2 px-3 py-1 text-xs font-bold";
  if (!href) return <span className={`${pill} border-ink/20 text-sub/50`}>{children}</span>;
  return (
    <Link href={href} scroll={false} className={`${pill} border-ink bg-card shadow-[2px_2px_0_var(--ink)]`}>
      {children}
    </Link>
  );
}
