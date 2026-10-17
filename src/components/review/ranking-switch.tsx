"use client";

import { useState } from "react";
import { RankingChart } from "./charts";
import { cn } from "@/lib/utils";

type Period = "week" | "month" | "all";
const LABEL: Record<Period, string> = { week: "今週", month: "今月", all: "累計" };

/** G14: penalty ranking, switching between this week, this month and all time. */
export function RankingSwitch({ rows }: { rows: { name: string; week: number; month: number; all: number }[] }) {
  const [period, setPeriod] = useState<Period>("week");
  const data = [...rows].map((row) => ({ name: row.name, points: row[period] })).sort((a, b) => b.points - a.points);
  return (
    <div className="grid gap-2">
      <div className="flex gap-1.5">
        {(Object.keys(LABEL) as Period[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={period === key}
            onClick={() => setPeriod(key)}
            className={cn("rounded-full border-2 border-ink px-3 py-0.5 text-xs font-bold", period === key ? "bg-ink text-white" : "bg-card")}
          >
            {LABEL[key]}
          </button>
        ))}
      </div>
      <RankingChart rows={data} />
    </div>
  );
}
