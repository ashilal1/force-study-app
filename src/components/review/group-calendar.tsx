import Link from "next/link";
import type { CalendarDay } from "@/components/review/achievement-calendar";
import { DayMark } from "@/components/review/achievement-calendar";
import { addDays, weekStartOf } from "@/lib/time";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

type Member = { id: string; name: string; days: CalendarDay[] };

/**
 * G12: who did what on which day, one small table per week (the latest 4, newest first):
 * 日〜土 with dates across the top, a row per member. Longer trends are in the weekly chart.
 */
export function GroupCalendar({ today, members, weeks = 4 }: { today: string; members: Member[]; weeks?: number }) {
  if (members.length === 0) return null;
  const byMember = new Map(members.map((member) => [member.id, new Map(member.days.map((day) => [day.date, day]))]));
  const starts = Array.from({ length: weeks }, (_, i) => addDays(weekStartOf(today), -7 * i));

  return (
    <div className="grid gap-3">
      {starts.map((start) => {
        const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
        // Skip weeks before anyone had joined.
        if (!members.some((member) => dates.some((date) => byMember.get(member.id)!.has(date)))) return null;
        return (
          <table key={start} className="w-full table-fixed border-collapse text-center text-xs">
            <thead>
              <tr>
                <th className="w-[6.5rem] pb-1 text-left text-[0.7rem] font-bold text-sub">
                  {Number(start.slice(5, 7))}/{Number(start.slice(8, 10))}〜{Number(dates[6].slice(8, 10))}
                </th>
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
                  <td className="truncate py-0.5 pr-1 text-left">
                    <Link href={`/members/${member.id}`} className="font-bold underline">
                      {member.name}
                    </Link>
                  </td>
                  {dates.map((date) => (
                    <td key={date} className="py-0.5">
                      <span className="inline-grid">
                        <DayMark date={date} day={byMember.get(member.id)!.get(date)} />
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}
