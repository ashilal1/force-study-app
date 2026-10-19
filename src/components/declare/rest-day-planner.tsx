"use client";

import { useState, useTransition } from "react";
import { setRestDay } from "@/actions/rest-days";
import { FieldError } from "@/components/form/submit-button";
import { formatJstDay, weekStartOf } from "@/lib/time";
import { cn } from "@/lib/utils";

export type PlannerDay = { date: string; rest: boolean; leave: boolean };

/**
 * F2: the next two weeks from tomorrow. Tap a day to make it a rest day (or undo). The weekly
 * limit counts Sunday-Saturday; the RPC enforces it, the counts here are a guide.
 */
export function RestDayPlanner({ days, perWeek }: { days: PlannerDay[]; perWeek: number }) {
  const [pending, startTransition] = useTransition();
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const weeks = new Map<string, PlannerDay[]>();
  for (const day of days) {
    const key = weekStartOf(day.date);
    weeks.set(key, [...(weeks.get(key) ?? []), day]);
  }

  function toggle(day: PlannerDay) {
    setError(undefined);
    setBusyDate(day.date);
    startTransition(async () => {
      const result = await setRestDay(day.date, !day.rest);
      if (result.error) setError(result.error);
      setBusyDate(null);
    });
  }

  return (
    <div className="grid gap-3">
      {[...weeks].map(([weekStart, weekDays]) => {
        const used = weekDays.filter((day) => day.rest).length;
        return (
          <div key={weekStart} className="grid gap-1.5">
            <p className="m-0 text-xs font-bold text-sub">
              {formatJstDay(weekStart)} の週 ・ 休息日 {used}/{perWeek}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  disabled={day.leave || pending}
                  onClick={() => toggle(day)}
                  aria-pressed={day.rest}
                  aria-label={`${formatJstDay(day.date)}${day.rest ? " 休息日（タップで取り消し）" : day.leave ? " 休会" : ""}`}
                  className={cn(
                    "th-cell grid min-h-14 place-items-center rounded-[10px] border-2 border-ink px-0.5 py-1 text-center text-xs leading-tight font-bold",
                    day.rest ? "bg-sky shadow-hard-sm" : day.leave ? "bg-muted text-sub" : "bg-card",
                    busyDate === day.date && "opacity-50",
                  )}
                >
                  <span>{formatJstDay(day.date).replace(/^\d+\//, "")}</span>
                  <span className="text-[0.65rem] font-medium">{day.rest ? "休息" : day.leave ? "休会" : ""}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <FieldError id="rest-error" message={error} />
    </div>
  );
}
