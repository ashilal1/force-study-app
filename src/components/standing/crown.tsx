import { THEME_IMAGES } from "@/lib/standing/assets";
import { cn } from "@/lib/utils";

/** The group's XP leader (F14). The owner's crown.png once it exists, a drawn one until then. */
export function Crown({ className, title = "グループの XP 1 位" }: { className?: string; title?: string }) {
  if (THEME_IMAGES.crown) {
    // eslint-disable-next-line @next/next/no-img-element -- small static decoration from public/
    return <img src="/theme/crown.png" alt={title} title={title} className={cn("th-crown inline-block h-auto w-5", className)} />;
  }
  return (
    <svg viewBox="0 0 24 18" role="img" aria-label={title} className={cn("inline-block h-auto w-5", className)}>
      <title>{title}</title>
      <path d="M2 16 L1 5 L7 10 L12 2 L17 10 L23 5 L22 16 Z" fill="#f2c94c" stroke="#8a6d1d" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="12" cy="11" r="1.6" fill="#c0392b" />
      <circle cx="6.5" cy="12.5" r="1.2" fill="#8e44ad" />
      <circle cx="17.5" cy="12.5" r="1.2" fill="#8e44ad" />
    </svg>
  );
}
