import { BADGE_IMAGES } from "@/lib/standing/assets";
import { TITLES, type Title } from "@/lib/standing/rules";
import { cn } from "@/lib/utils";

/**
 * A member's titles (F13): up to `max` badges and "+N" for the rest. Tapping (or hovering) shows
 * what each one is. Trial-only bad titles are faded and marked 「本番なら」.
 */
export function TitleBadges({ titles, max = 3, className }: { titles: Title[]; max?: number; className?: string }) {
  if (titles.length === 0) return null;
  const shown = titles.slice(0, max);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {shown.map((title) => (
        <TitleBadge key={title.id} title={title} />
      ))}
      {titles.length > shown.length ? <span className="text-xs font-bold text-sub">+{titles.length - shown.length}</span> : null}
    </span>
  );
}

export function TitleBadge({ title, size = "sm" }: { title: Title; size?: "sm" | "lg" }) {
  const def = TITLES[title.id];
  const label = `${title.trial ? "本番なら" : ""}「${def.name}」: ${def.how}（${def.until}）`;
  const image = BADGE_IMAGES.has(title.id);
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border-2 font-bold whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[0.7rem]" : "px-2.5 py-1 text-sm",
        def.good ? "border-mint-ink bg-mint/60 text-ink" : "border-red bg-red/10 text-red",
        title.trial && "border-dashed opacity-60",
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- small static badge from public/
        <img src={`/badges/${title.id}.png`} alt="" className={size === "sm" ? "-my-1 size-5" : "-my-1.5 size-7"} />
      ) : null}
      {title.trial ? "本番なら " : ""}
      {def.name}
    </span>
  );
}
