import { cookies } from "next/headers";
import { UiThemeLayer } from "@/components/theme/ui-theme-layer";
import { requireMember } from "@/lib/auth";
import { getStandings } from "@/lib/standing/load";
import { RANKS, type RankId } from "@/lib/standing/rules";
import { isUiTheme, lookFor, type Look } from "@/lib/theme/themes";
import { jstDateString } from "@/lib/time";
import { ThemeLayer } from "./theme-layer";

/** Development only: the `dev_viewer_rank` cookie tries another rank's look (see /preview). */
export async function devRankOverride(): Promise<RankId | null> {
  if (process.env.NODE_ENV === "production") return null;
  const value = (await cookies()).get("dev_viewer_rank")?.value;
  return RANKS.find((rank) => rank.id === value)?.id ?? null;
}

/**
 * Development only: the `dev_ui_theme` cookie tries a look theme, seasonal ones included, whatever
 * the date ("paper" = 標準). Null when unset.
 */
export async function devLookOverride(): Promise<Look | null> {
  if (process.env.NODE_ENV === "production") return null;
  const value = (await cookies()).get("dev_ui_theme")?.value;
  if (value === "paper") return { kind: "rank" };
  return isUiTheme(value) ? { kind: "theme", id: value } : null;
}

/** Restyles the whole screen: the look theme the viewer picked (F16), or their rank's look (F14). */
export async function ViewerTheme() {
  const me = await requireMember();
  const rank = (await devRankOverride()) ?? (await getStandings()).get(me.id)?.rank.id ?? null;
  const look =
    (await devLookOverride()) ?? lookFor({ picked: me.ui_theme, seasonThemes: me.season_themes, rank, today: jstDateString() });
  if (look.kind === "theme") return <UiThemeLayer theme={look.id} />;
  return rank ? <ThemeLayer rank={rank} /> : null;
}
