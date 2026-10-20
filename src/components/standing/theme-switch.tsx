"use client";

import { useTransition } from "react";
import { setDevViewerRank } from "@/actions/dev-theme";
import { RANKS, type RankId } from "@/lib/standing/rules";

/**
 * Development only (the /preview bar): try each rank's look. Sets the `dev_viewer_rank` cookie
 * that ViewerTheme and the preview read; the real rank comes back with 「本来」.
 */
export function ThemeSwitch({ current }: { current: RankId | null }) {
  const [, startTransition] = useTransition();
  // Setting a cookie in a Server Action refreshes the page with the new look.
  const pick = (rank: RankId | null) => startTransition(() => setDevViewerRank(rank));
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span className="text-white/60">ランクの見た目:</span>
      {RANKS.map((rank) => (
        <button key={rank.id} type="button" onClick={() => pick(rank.id)} className={current === rank.id ? "font-black underline" : ""}>
          {rank.name}
        </button>
      ))}
      <button type="button" onClick={() => pick(null)} className={current === null ? "font-black underline" : ""}>
        本来
      </button>
    </span>
  );
}
