"use server";

import { cookies } from "next/headers";
import { RANKS, type RankId } from "@/lib/standing/rules";
import { isUiTheme } from "@/lib/theme/themes";

// Development only: the /preview bar tries each rank's look (F14) and each seasonal theme (F16). Only a
// cookie on this browser; nothing is recorded, and production ignores it (ViewerTheme's overrides).

export async function setDevViewerRank(rank: RankId | null): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const store = await cookies();
  if (rank && RANKS.some((r) => r.id === rank)) store.set("dev_viewer_rank", rank, { path: "/", maxAge: 86400 });
  else store.delete("dev_viewer_rank");
}

/** A seasonal theme id, "paper" for 標準, or null to go back to what the member picked. */
export async function setDevUiTheme(theme: string | null): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const store = await cookies();
  if (theme === "paper" || isUiTheme(theme)) store.set("dev_ui_theme", theme, { path: "/", maxAge: 86400 });
  else store.delete("dev_ui_theme");
}
