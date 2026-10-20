import type { RankId } from "@/lib/standing/rules";

// Look themes (F16, ADR-045). Each member picks how their own screens look; nobody else sees it.
// 標準 is the paper look that follows the rank (F14). The seasonal themes take over for everyone who
// leaves the switch on, only during their season (JST dates), and then the pick comes back.

export type PickableThemeId = "forest" | "ocean" | "snow" | "sakura" | "sunset" | "space";
export type SeasonThemeId = "halloween" | "christmas" | "newyear";
export type UiThemeId = PickableThemeId | SeasonThemeId;

export type ThemeInfo = { id: UiThemeId; name: string; en: string; description: string };

export const PICKABLE_THEMES: readonly (ThemeInfo & { id: PickableThemeId })[] = [
  { id: "forest", name: "森", en: "FOREST", description: "木の板と葉っぱのカード" },
  { id: "ocean", name: "海", en: "OCEAN", description: "光が差す深い海とガラスのカード" },
  { id: "snow", name: "雪", en: "SNOW", description: "雪が積もった氷のカード" },
  { id: "sakura", name: "桜", en: "SAKURA", description: "花びらが舞う、やわらかい桃色" },
  { id: "sunset", name: "夕焼け", en: "SUNSET", description: "日が沈む空と浮かぶランタン" },
  { id: "space", name: "宇宙", en: "SPACE", description: "星座と光る計器パネル" },
];

/** Seasons as JST "MM-DD", both ends included. */
export const SEASON_THEMES: readonly (ThemeInfo & { id: SeasonThemeId; from: string; to: string })[] = [
  { id: "halloween", name: "ハロウィン", en: "HALLOWEEN", description: "月夜のコウモリとかぼちゃ", from: "10-01", to: "10-31" },
  { id: "christmas", name: "クリスマス", en: "XMAS", description: "電飾とキャンディ柄のカード", from: "12-01", to: "12-25" },
  { id: "newyear", name: "お正月", en: "NEW YEAR", description: "金の水引と青海波、その年の干支", from: "01-01", to: "01-07" },
];

export function isPickableTheme(value: unknown): value is PickableThemeId {
  return PICKABLE_THEMES.some((theme) => theme.id === value);
}

export function isUiTheme(value: unknown): value is UiThemeId {
  return isPickableTheme(value) || SEASON_THEMES.some((theme) => theme.id === value);
}

/** The season `today` ("YYYY-MM-DD", JST) falls in, or null. */
export function seasonOf(today: string) {
  const day = today.slice(5);
  return SEASON_THEMES.find((season) => season.from <= day && day <= season.to) ?? null;
}

/** "10/1〜10/31" */
export function seasonLabel(season: { from: string; to: string }): string {
  const md = (value: string) => value.split("-").map(Number).join("/");
  return `${md(season.from)}〜${md(season.to)}`;
}

const ZODIAC = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

/** The year's zodiac sign for the お正月 theme: 2027 is 未 (ひつじ). */
export function zodiacOf(year: number): (typeof ZODIAC)[number] {
  return ZODIAC[(((year - 2020) % 12) + 12) % 12];
}

export type Look = { kind: "rank" } | { kind: "theme"; id: UiThemeId };

/**
 * What the viewer's screens look like. どうしようもない keeps its concrete whatever was picked (it
 * is the penalty look, ADR-042); otherwise the season wins while it lasts (unless switched off),
 * then the pick, then 標準 (the rank look).
 */
export function lookFor(input: { picked: string | null; seasonThemes: boolean; rank: RankId | null; today: string }): Look {
  if (input.rank === "doushiyou-mo-nai") return { kind: "rank" };
  const season = input.seasonThemes ? seasonOf(input.today) : null;
  if (season) return { kind: "theme", id: season.id };
  if (isPickableTheme(input.picked)) return { kind: "theme", id: input.picked };
  return { kind: "rank" };
}
