import type { RankId } from "@/lib/standing/rules";

// Seasonal themes (F16, ADR-046): ハロウィン・クリスマス・お正月 take over everyone's screens
// during their season (JST dates); outside one, the rank look (F14) applies. Still being finished, so
// production never shows them (ViewerTheme).

export type UiThemeId = "halloween" | "christmas" | "newyear";

/** Seasons as JST "MM-DD", both ends included. */
export const SEASON_THEMES: readonly { id: UiThemeId; name: string; from: string; to: string }[] = [
  { id: "halloween", name: "ハロウィン", from: "10-01", to: "10-31" },
  { id: "christmas", name: "クリスマス", from: "12-01", to: "12-25" },
  { id: "newyear", name: "お正月", from: "01-01", to: "01-07" },
];

export function isUiTheme(value: unknown): value is UiThemeId {
  return SEASON_THEMES.some((theme) => theme.id === value);
}

/** The season `today` ("YYYY-MM-DD", JST) falls in, or null. */
export function seasonOf(today: string) {
  const day = today.slice(5);
  return SEASON_THEMES.find((season) => season.from <= day && day <= season.to) ?? null;
}

const ZODIAC = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

/** The year's zodiac sign for the お正月 theme: 2027 is 未 (ひつじ). */
export function zodiacOf(year: number): (typeof ZODIAC)[number] {
  return ZODIAC[(((year - 2020) % 12) + 12) % 12];
}

export type Look = { kind: "rank" } | { kind: "theme"; id: UiThemeId };

/**
 * What the viewer's screens look like: the season while it lasts (unless switched off), otherwise
 * the rank look. どうしようもない keeps its concrete even then (it is the penalty look, ADR-042).
 */
export function lookFor(input: { seasonThemes: boolean; rank: RankId | null; today: string }): Look {
  if (input.rank === "doushiyou-mo-nai") return { kind: "rank" };
  const season = input.seasonThemes ? seasonOf(input.today) : null;
  return season ? { kind: "theme", id: season.id } : { kind: "rank" };
}
