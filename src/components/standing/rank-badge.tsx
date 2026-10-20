import { BADGE_IMAGES } from "@/lib/standing/assets";
import type { Standing } from "@/lib/standing/rules";
import { cn } from "@/lib/utils";

/** The rank colors, shared with the XP trend chart. */
export const RANK_TONE: Record<string, string> = {
  tensai: "border-[#a8841f] bg-gradient-to-br from-[#fff3c4] via-[#f2c94c] to-[#d4a72c] text-ink",
  yuutousei: "border-[#7d8590] bg-gradient-to-br from-[#ffffff] via-[#d9dde3] to-[#aeb6c1] text-ink",
  "yareba-dekiru": "border-ink bg-card text-ink",
  "mikka-bouzu": "border-ink bg-card text-ink",
  "doushiyou-mo-nai": "border-[#3a3a3a] bg-[#6b6b6b] text-white",
};

/** The rank name (F14), in the rank's colors. */
export function RankBadge({ standing, className }: { standing: Standing; className?: string }) {
  const id = `rank-${standing.rank.id}`;
  return (
    <span
      title={`ランク: ${standing.rank.name}（直近 28 日 ${standing.xp} XP）`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border-2 px-2 py-0.5 text-[0.72rem] font-black whitespace-nowrap",
        RANK_TONE[standing.rank.id],
        className,
      )}
    >
      {BADGE_IMAGES.has(id) ? (
        // eslint-disable-next-line @next/next/no-img-element -- small static badge from public/
        <img src={`/badges/${id}.png`} alt="" className="size-4" />
      ) : null}
      {standing.rank.name}
    </span>
  );
}

/** "優等生 ▰▰▰▱▱ あと 120 XP で天才" with the XP beside it. */
export function RankGauge({ standing }: { standing: Standing }) {
  const filled = standing.next ? Math.round(standing.next.progress * 5) : 5;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold">
      <RankBadge standing={standing} />
      <span aria-hidden className="tracking-[-0.1em]">
        {"▰".repeat(filled)}
        {"▱".repeat(5 - filled)}
      </span>
      <span className="text-sub">
        {standing.next ? `あと ${standing.next.needed} XP で${standing.next.name}` : "最高ランク"}・{standing.xp} XP
      </span>
    </span>
  );
}
