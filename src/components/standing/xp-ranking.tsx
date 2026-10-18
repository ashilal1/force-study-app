import Link from "next/link";
import { Avatar } from "@/components/brand/avatar";
import { Sticker } from "@/components/brand/sticker";
import type { Standing } from "@/lib/standing/rules";
import { cn } from "@/lib/utils";
import { Crown } from "./crown";
import { RankBadge } from "./rank-badge";

export type XpRow = { id: string; name: string; avatarUrl: string | null; colorIndex: number; standing: Standing };

/** The group's XP over the last 28 days (F14), with the crown and the tilted last place. */
export function XpRanking({ rows }: { rows: XpRow[] }) {
  const ranked = [...rows].sort((a, b) => b.standing.xp - a.standing.xp);
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 font-en text-[1.4rem] leading-none">RANKING</h2>
        <span className="text-xs font-bold text-sub">直近 28 日の XP</span>
      </div>
      <ol className="m-0 grid list-none gap-2 p-0">
        {ranked.map((row) => {
          const place = ranked.findIndex((other) => other.standing.xp === row.standing.xp) + 1;
          return (
            <li key={row.id}>
              <Sticker
                shadow="sm"
                data-rank={row.standing.rank.id}
                data-compact
                className={cn(
                  "rank-card relative grid grid-cols-[1.6rem_36px_1fr_auto] items-center gap-2.5 px-3 py-2",
                  row.standing.crown && "py-3",
                  row.standing.last && "-rotate-1",
                )}
              >
                <span className="font-en text-lg">{row.standing.crown ? <Crown className="w-6" /> : place}</span>
                <Avatar name={row.name} src={row.avatarUrl} colorIndex={row.colorIndex} className="size-9 border-2" />
                <Link href={`/members/${row.id}`} className="min-w-0 truncate font-bold hover:underline">
                  {row.name}
                </Link>
                <span className="flex items-center gap-2">
                  <RankBadge standing={row.standing} />
                  <span className="font-en text-base tabular-nums">{row.standing.xp} XP</span>
                </span>
              </Sticker>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
