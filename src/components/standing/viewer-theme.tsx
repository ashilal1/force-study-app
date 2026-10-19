import { cookies } from "next/headers";
import { requireMember } from "@/lib/auth";
import { getStandings } from "@/lib/standing/load";
import { RANKS, type RankId } from "@/lib/standing/rules";
import { ThemeLayer } from "./theme-layer";

/** Development only: the `dev_viewer_rank` cookie tries another rank's look (see /preview). */
export async function devRankOverride(): Promise<RankId | null> {
  if (process.env.NODE_ENV === "production") return null;
  const value = (await cookies()).get("dev_viewer_rank")?.value;
  return RANKS.find((rank) => rank.id === value)?.id ?? null;
}

/** Restyles the whole screen for the viewer's own rank (F14, ADR-042). */
export async function ViewerTheme() {
  const me = await requireMember();
  const rank = (await devRankOverride()) ?? (await getStandings()).get(me.id)?.rank.id;
  return rank ? <ThemeLayer rank={rank} /> : null;
}
