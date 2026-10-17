import Link from "next/link";
import { formatJstDateTime } from "@/lib/time";
import type { TimelineItem } from "@/lib/timeline";

/** Group timeline (F10): who did what, newest first. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <p className="m-0 text-sm text-sub">まだ出来事はありません</p>;
  return (
    <ol className="m-0 grid list-none gap-0 border-l-[3px] border-ink p-0 pl-4">
      {items.map((item) => (
        <li key={item.id} className="relative pb-3">
          <span aria-hidden className="absolute top-1.5 -left-[1.4rem] size-3 rounded-full border-[2.5px] border-ink bg-tape" />
          <Link href={item.href} className="block">
            <time dateTime={item.at} className="text-xs text-sub">
              {formatJstDateTime(item.at)}
            </time>
            <p className="m-0 text-sm font-bold">{item.title}</p>
            {item.body ? <p className="m-0 text-xs font-medium text-sub">{item.body}</p> : null}
          </Link>
        </li>
      ))}
    </ol>
  );
}
