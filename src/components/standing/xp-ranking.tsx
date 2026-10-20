import Link from "next/link";
import { Avatar } from "@/components/brand/avatar";
import { Sticker } from "@/components/brand/sticker";
import type { Standing } from "@/lib/standing/rules";
import { cn } from "@/lib/utils";
import { Crown } from "./crown";
import { CrownConfetti } from "./crown-confetti";
import { RankBadge } from "./rank-badge";

export type XpRow = { id: string; name: string; avatarUrl: string | null; colorIndex: number; standing: Standing };

/**
 * The group's XP over the last 28 days (F14), with the crown and the tilted last place. `crownMoved`
 * is the latest move of the crown to its current holder, for the confetti.
 */
export function XpRanking({ rows, crownMoved = null }: { rows: XpRow[]; crownMoved?: { eventId: string; name: string } | null }) {
  const ranked = [...rows].sort((a, b) => b.standing.xp - a.standing.xp);
  return (
    <section className="relative isolate grid gap-3">
      {crownMoved ? <CrownConfetti eventId={crownMoved.eventId} name={crownMoved.name} /> : null}
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 font-en text-[1.4rem] leading-none">RANKING</h2>
        <span className="text-xs font-bold text-sub">直近 28 日の XP</span>
      </div>
      <ol className="m-0 grid list-none gap-2 p-0">
        {ranked.map((row) => {
          const place = ranked.findIndex((other) => other.standing.xp === row.standing.xp) + 1;
          return (
            // The crown sits on the avatar but outside the card, so a themed edge doesn't trace it.
            <li key={row.id} className="relative">
              <Sticker
                shadow="sm"
                className={cn(
                  "grid grid-cols-[1.6rem_36px_1fr_auto] items-center gap-2.5 px-3 py-2",
                  row.standing.crown && "py-3",
                  row.standing.last && "-rotate-1",
                )}
              >
                <span className="font-en text-lg">{place}</span>
                <Avatar name={row.name} src={row.avatarUrl} colorIndex={row.colorIndex} className="size-9 border-2" />
                <Link href={`/members/${row.id}`} className="min-w-0 truncate font-bold hover:underline">
                  {row.name}
                </Link>
                <span className="flex items-center gap-2">
                  <RankBadge standing={row.standing} />
                  <span className="font-en text-base tabular-nums">{row.standing.xp} XP</span>
                </span>
              </Sticker>
              {row.standing.crown ? (
                <Crown className="pointer-events-none absolute top-[3px] left-[calc(15px+1.6rem)] z-10 w-7 -rotate-[18deg]" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
