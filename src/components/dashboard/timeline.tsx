import Link from "next/link";
import { Crown } from "@/components/standing/crown";
import { getStandings } from "@/lib/standing/load";
import { formatJstDateTime } from "@/lib/time";
import type { TimelineItem } from "@/lib/timeline";

/** Group timeline (F10): who did what, newest first. The group's XP leader wears the crown (F14). */
export async function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <p className="m-0 text-sm text-sub">まだ出来事はありません</p>;
  const crownId = [...(await getStandings()).values()].find((standing) => standing.crown)?.memberId ?? null;
  return (
    <ol className="th-tl m-0 grid list-none gap-0 border-l-[3px] border-ink p-0 pl-4">
      {items.map((item) => (
        <li key={item.id} className="relative pb-3">
          <span aria-hidden className="th-tl-dot absolute top-1.5 -left-[1.4rem] size-3 rounded-full border-[2.5px] border-ink bg-tape" />
          <Link href={item.href} className="block">
            <time dateTime={item.at} className="text-xs text-sub">
              {formatJstDateTime(item.at)}
            </time>
            <p className="m-0 text-sm font-bold">
              <Title item={item} crowned={item.actor !== null && item.actor.id === crownId} />
            </p>
            {item.body ? <p className="m-0 text-xs font-medium text-sub">{item.body}</p> : null}
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** The title with the crown right after the actor's name, where the name appears. */
function Title({ item, crowned }: { item: TimelineItem; crowned: boolean }) {
  const name = item.actor?.display_name;
  const at = crowned && name ? item.title.indexOf(name) : -1;
  if (at < 0) return item.title;
  const end = at + name!.length;
  return (
    <>
      {item.title.slice(0, at)}
      <span className="whitespace-nowrap">
        {name}
        <Crown className="ml-0.5 w-4 align-[-0.1em]" />
      </span>
      {item.title.slice(end)}
    </>
  );
}
