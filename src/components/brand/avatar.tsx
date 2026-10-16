import { cn } from "@/lib/utils";

const SWATCHES = ["bg-mint", "bg-peach", "bg-sky", "bg-lilac", "bg-tape"] as const;

/** Member avatar: Google photo when there is one, otherwise the first letter on a stable color. */
export function Avatar({
  name,
  src,
  colorIndex = 0,
  className,
}: {
  name: string;
  src?: string | null;
  colorIndex?: number;
  className?: string;
}) {
  const base = cn("grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border-[3px] border-ink", className);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars come from Google; no need for next/image here
    return <img src={src} alt="" className={base} />;
  }
  return (
    <span aria-hidden className={cn(base, "font-heading text-lg", SWATCHES[colorIndex % SWATCHES.length])}>
      {name.slice(0, 1)}
    </span>
  );
}
