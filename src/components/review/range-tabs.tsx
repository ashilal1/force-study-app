import Link from "next/link";
import { RANGES, type Range } from "@/lib/stats";
import { cn } from "@/lib/utils";

/** Period switch for the retrospective (直近 4 週 / 3 か月 / 全期間), kept in the URL. */
export function RangeTabs({ basePath, current }: { basePath: string; current: Range }) {
  return (
    <nav aria-label="期間" className="flex gap-1.5">
      {RANGES.map((range) => (
        <Link
          key={range.value}
          href={`${basePath}?range=${range.value}`}
          aria-current={current === range.value ? "page" : undefined}
          className={cn(
            "th-chip rounded-full border-2 border-ink px-3 py-1 text-xs font-bold",
            current === range.value ? "bg-ink text-white" : "bg-card",
          )}
        >
          {range.label}
        </Link>
      ))}
    </nav>
  );
}
