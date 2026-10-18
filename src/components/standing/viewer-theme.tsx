import { requireMember } from "@/lib/auth";
import { THEME_IMAGES } from "@/lib/standing/assets";
import { getStandings } from "@/lib/standing/load";

/**
 * Restyles the whole screen for the viewer's own rank (F14): a marker the CSS in globals.css
 * keys on, plus the fixed decorations of the lowest rank. Purely decorative: never covers a
 * control (pointer-events off, kept clear of the bottom menu).
 */
export async function ViewerTheme() {
  const me = await requireMember();
  const standing = (await getStandings()).get(me.id);
  if (!standing) return null;
  const assets = Object.entries(THEME_IMAGES)
    .filter(([, available]) => available)
    .map(([name]) => name)
    .join(" ");
  return (
    <>
      <div hidden data-viewer-rank={standing.rank.id} data-theme-assets={assets} />
      {standing.rank.id === "doushiyou-mo-nai" ? <PenaltyDecor /> : null}
    </>
  );
}

/** A siren in the corner and a strip of bars above the bottom menu. */
function PenaltyDecor() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom,0px))] z-10">
      <div
        className="h-3 opacity-40"
        style={{
          backgroundImage: THEME_IMAGES.bars
            ? "url(/theme/bars.png)"
            : "repeating-linear-gradient(90deg, #1d1d1d 0 4px, transparent 4px 22px)",
          backgroundSize: THEME_IMAGES.bars ? "auto 100%" : undefined,
        }}
      />
      <div className="absolute bottom-3 left-1.5 w-9 md:w-11">
        {THEME_IMAGES.siren ? (
          // eslint-disable-next-line @next/next/no-img-element -- small static decoration from public/
          <img src="/theme/siren.png" alt="" className="h-auto w-full" />
        ) : (
          <svg viewBox="0 0 40 40" className="h-auto w-full">
            <path d="M8 34 L10 18 Q20 8 30 18 L32 34 Z" fill="#e5534b" stroke="#141416" strokeWidth="2" />
            <rect x="5" y="34" width="30" height="4" rx="1" fill="#141416" />
            <path d="M20 2 V7 M6 8 L9 11 M34 8 L31 11 M1 20 H5 M39 20 H35" stroke="#e5534b" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}
      </div>
    </div>
  );
}
