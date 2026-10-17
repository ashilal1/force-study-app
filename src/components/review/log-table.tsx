"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createColumnHelper, createSortedRowModel, rowSortingFeature, sortFn_alphanumeric, tableFeatures, useTable } from "@tanstack/react-table";
import { DAY_KIND, FAILURE_CATEGORY, PENALTY_REASON, type DayKind } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

/** G10: every day as a row. Sort by any column, filter by result, tap a row for that day. */

export type LogRow = {
  date: string;
  kind: DayKind;
  studyLogId: string | null;
  declaration: string | null;
  finalScore: number | null;
  attempts: number;
  elapsedMinutes: number | null;
  penaltyPoints: number;
  penaltyReason: string | null;
  failureCategory: string | null;
};

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
});
const helper = createColumnHelper<typeof features, LogRow>();
const columns = helper.columns([
  helper.accessor("date", { header: "日付", cell: (info) => `${Number(info.getValue().slice(5, 7))}/${Number(info.getValue().slice(8, 10))}` }),
  helper.accessor("kind", { header: "結果", cell: (info) => `${DAY_KIND[info.getValue()].symbol} ${DAY_KIND[info.getValue()].label}` }),
  helper.accessor("declaration", { header: "宣言", enableSorting: false, cell: (info) => info.getValue() ?? "" }),
  helper.accessor("finalScore", { header: "点数", sortUndefined: "last", cell: (info) => info.getValue() ?? "" }),
  helper.accessor("attempts", { header: "提出", cell: (info) => (info.getValue() > 0 ? `${info.getValue()}回` : "") }),
  helper.accessor("elapsedMinutes", { header: "時間", sortUndefined: "last", cell: (info) => (info.getValue() === null ? "" : `${info.getValue()}分`) }),
  helper.accessor("penaltyPoints", {
    header: "ペナルティ",
    cell: (info) => (info.getValue() > 0 ? `${info.getValue().toLocaleString()}円` : ""),
  }),
  helper.accessor("failureCategory", {
    header: "理由",
    enableSorting: false,
    cell: (info) => {
      const row = info.row.original;
      return (row.failureCategory ? FAILURE_CATEGORY[row.failureCategory] : null) ?? (row.penaltyReason ? PENALTY_REASON[row.penaltyReason]?.label : "") ?? "";
    },
  }),
]);

const FILTERS: { value: "all" | DayKind; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "completed", label: "達成" },
  { value: "missed", label: "未達成" },
  { value: "no_declaration", label: "宣言なし" },
];

export function LogTable({ rows }: { rows: LogRow[] }) {
  const [filter, setFilter] = useState<"all" | DayKind>("all");
  const data = useMemo(
    () => rows.filter((row) => row.kind !== "none" && (filter === "all" || row.kind === filter)).reverse(),
    [rows, filter],
  );
  const table = useTable({ features, columns, data });

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
            className={cn(
              "rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-bold",
              filter === option.value ? "bg-ink text-white" : "bg-card",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-[12px] border-[2.5px] border-ink bg-card">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b-2 border-ink">
                {group.headers.map((header) => (
                  <th key={header.id} className="px-2 py-1.5 text-left font-black whitespace-nowrap">
                    {header.column.getCanSort() ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()} className="font-black">
                        <table.FlexRender header={header} />
                        {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ?? ""}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-dashed border-ink/40 last:border-0">
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className={cn("px-2 py-1.5 align-top", cell.column.id === "declaration" ? "max-w-[220px]" : "whitespace-nowrap")}>
                    {row.original.studyLogId && cell.column.id === "date" ? (
                      <Link href={`/logs/${row.original.studyLogId}`} className="font-bold underline">
                        <table.FlexRender cell={cell} />
                      </Link>
                    ) : (
                      <table.FlexRender cell={cell} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
