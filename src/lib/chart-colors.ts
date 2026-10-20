// One place for the colors, symbols and labels of results and penalty reasons, so every chart
// and calendar agrees (docs/architecture.md §5). Colors come from theme tokens; every color is
// paired with a symbol or label so the charts don't rely on color alone.

export type DayKind = "completed" | "missed" | "no_declaration" | "invalidated" | "pending" | "rest" | "leave" | "none";

export const DAY_KIND: Record<DayKind, { label: string; symbol: string; className: string }> = {
  completed: { label: "達成", symbol: "✓", className: "bg-mint" },
  missed: { label: "未達成", symbol: "✕", className: "bg-red text-white" },
  no_declaration: { label: "宣言なし", symbol: "−", className: "bg-[#8c1d17] text-white" },
  invalidated: { label: "証拠不認定", symbol: "✕", className: "bg-[#8c1d17] text-white" },
  pending: { label: "進行中", symbol: "…", className: "bg-tape" },
  rest: { label: "休み", symbol: "・", className: "bg-muted text-sub" },
  leave: { label: "休会", symbol: "・", className: "bg-muted text-sub" },
  none: { label: "記録なし", symbol: "", className: "bg-card" },
};

/** Darker mint for higher scores on completed days (G2). */
export function completedShade(score: number | null): string {
  if (score === null || score < 80) return "bg-mint";
  if (score < 90) return "bg-[#7cc4a6]";
  return "bg-mint-ink text-white";
}

export const PENALTY_REASON: Record<string, { label: string; color: string }> = {
  no_declaration: { label: "宣言なし", color: "var(--red)" },
  unrevised: { label: "書き直しなし", color: "#b23a32" },
  slacked: { label: "サボり", color: "#8c1d17" },
  not_reported: { label: "申告なし", color: "#5e140f" },
  unrealistic_streak: { label: "妥当でない宣言の連続", color: "#c9a227" },
  excuse_rejected: { label: "理由の却下", color: "#3d7fc4" },
  excuse_expired: { label: "審査の期限切れ", color: "#2a5d93" },
  fake_evidence: { label: "証拠不認定", color: "#7b5ea7" },
  late_payment: { label: "未払い", color: "var(--orange)" },
};

/** One line color per member, in the group's member order (G13, the XP race). */
export const MEMBER_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "#7b5ea7", "var(--orange)"];

export const FAILURE_CATEGORY: Record<string, string> = {
  unrealistic: "宣言が妥当でなかった",
  slacked: "サボった",
  sudden_plan: "急遽予定",
  other: "その他",
  not_reported: "申告なし",
};

export const OBJECTION_KIND: Record<string, { label: string; color: string }> = {
  too_light: { label: "軽すぎる", color: "#c9a227" },
  suspicious: { label: "怪しい", color: "#7b5ea7" },
  excuse_rejected: { label: "納得できない", color: "#3d7fc4" },
  dispute_rejected: { label: "最終審査の却下", color: "var(--red)" },
  leave_rejected: { label: "休会の却下", color: "var(--sub)" },
  ai_rejected: { label: "AI 不合格", color: "var(--mint-ink)" },
};
