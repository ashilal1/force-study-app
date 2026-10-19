"use server";

import { cookies } from "next/headers";
import { RANKS, type RankId } from "@/lib/standing/rules";

// Development only: the /preview bar tries each rank's look (F14). Only a cookie on this browser;
// nothing is recorded, and production ignores it (ViewerTheme's devRankOverride).

export async function setDevViewerRank(rank: RankId | null): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const store = await cookies();
  if (rank && RANKS.some((r) => r.id === rank)) store.set("dev_viewer_rank", rank, { path: "/", maxAge: 86400 });
  else store.delete("dev_viewer_rank");
}
