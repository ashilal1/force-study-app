import { THEME_IMAGES } from "@/lib/standing/assets";
import type { RankId } from "@/lib/standing/rules";

/** The look the viewer's rank gives the whole screen (F14, ADR-042, ADR-044). */
export type ViewerThemeId = "gold" | "silver" | "bronze" | "slack" | "worn";

const THEMES: Record<RankId, ViewerThemeId> = {
  tensai: "gold",
  yuutousei: "silver",
  "yareba-dekiru": "bronze",
  "mikka-bouzu": "slack",
  "doushiyou-mo-nai": "worn",
};

export function themeOf(rank: RankId): ViewerThemeId {
  return THEMES[rank];
}

/** Gold, silver and bronze share the polished cards; 三日坊主 is slack paper; どうしようもない is worn. */
function finishOf(theme: ViewerThemeId): string {
  return theme === "worn" || theme === "slack" ? theme : "polished";
}

/**
 * The marker rank-themes.css keys on, and the decorations behind the page: gold confetti for
 * 天才, a few silver glints for 優等生, a vignette with a siren and bars above the bottom menu for
 * どうしようもない (銅 and 三日坊主 have none). Purely decorative: behind the content or clear of it, never takes a tap,
 * still under "reduce motion".
 */
export function ThemeLayer({ rank }: { rank: RankId }) {
  const theme = themeOf(rank);
  return (
    <>
      <div
        hidden
        data-viewer-rank={rank}
        data-viewer-theme={theme}
        data-viewer-finish={finishOf(theme)}
      />
      {theme === "gold" ? <GoldBackdrop /> : theme === "silver" ? <SilverBackdrop /> : theme === "worn" ? <WornDecor /> : null}
    </>
  );
}

/** Same pieces on every render (no hydration mismatch, no reshuffle on navigation). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GOLDS = [
  "linear-gradient(135deg,#fff3b0,#e2a92b)",
  "linear-gradient(135deg,#ffe27a,#b8860b)",
  "linear-gradient(135deg,#fffbe6,#f2c94c)",
  "linear-gradient(135deg,#f7d774,#a8741a)",
];

const CONFETTI = (() => {
  const r = seeded(7);
  return Array.from({ length: 36 }, (_, i) => {
    const dur = 16 + r() * 14;
    const width = 5 + r() * 7;
    const round = r() < 0.3;
    return {
      left: `${(r() * 100).toFixed(1)}%`,
      restY: `${(r() * 100).toFixed(1)}vh`,
      dur: `${dur.toFixed(1)}s`,
      delay: `${(-r() * dur).toFixed(1)}s`,
      spin: `${(2.4 + r() * 2.4).toFixed(1)}s`,
      width: round ? width * 0.8 : width,
      height: round ? width * 0.8 : width * 0.45,
      round,
      opacity: 0.55 + r() * 0.4,
      fill: GOLDS[i % GOLDS.length],
    };
  });
})();

function GoldBackdrop() {
  return (
    <div aria-hidden className="th-backdrop" style={{ background: "var(--th-frame)" }}>
      {CONFETTI.map((piece, i) => (
        <span
          key={i}
          className="th-confetti"
          style={
            {
              left: piece.left,
              "--rest-y": piece.restY,
              "--dur": piece.dur,
              "--delay": piece.delay,
              "--spin": piece.spin,
            } as React.CSSProperties
          }
        >
          <span
            style={{
              width: piece.width,
              height: piece.height,
              borderRadius: piece.round ? 9999 : 1,
              background: piece.fill,
              opacity: piece.opacity,
            }}
          />
        </span>
      ))}
    </div>
  );
}

const STARS = (() => {
  const r = seeded(21);
  return Array.from({ length: 18 }, () => ({
    left: `${(r() * 100).toFixed(1)}%`,
    top: `${(r() * 100).toFixed(1)}%`,
    size: 6 + r() * 10,
    dur: `${(2.8 + r() * 3).toFixed(1)}s`,
    delay: `${(-r() * 5).toFixed(1)}s`,
  }));
})();

function SilverBackdrop() {
  return (
    <div aria-hidden className="th-backdrop" style={{ background: "var(--th-frame)" }}>
      {STARS.map((star, i) => (
        <span
          key={i}
          className="th-star"
          style={
            {
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              "--dur": star.dur,
              "--delay": star.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** A dark vignette and stains behind the page; a flashing siren and bars above the bottom menu. */
function WornDecor() {
  return (
    <>
      <div
        aria-hidden
        className="th-backdrop"
        style={{
          boxShadow: "inset 0 0 90px rgba(0,0,0,.5)",
          background:
            "radial-gradient(ellipse 60% 18% at 80% 34%, rgba(70,50,25,.14), transparent 70%), radial-gradient(ellipse 50% 14% at 18% 66%, rgba(0,0,0,.12), transparent 70%)",
        }}
      />
      <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom,0px))] z-10">
        <div
          className="h-3.5 opacity-75"
          style={{
            background: THEME_IMAGES.bars
              ? "url(/theme/bars.png) 0 0 / auto 100%"
              : "linear-gradient(#2b2b2b,#2b2b2b) 0 0/100% 3px no-repeat, repeating-linear-gradient(90deg,#262626 0 4px,#7a7a7a 4px 5px,transparent 5px 22px)",
          }}
        />
        <div className="absolute bottom-3 left-1 w-[42px] md:w-11">
          <span className="th-siren-glow" />
          {THEME_IMAGES.siren ? (
            // eslint-disable-next-line @next/next/no-img-element -- small static decoration from public/
            <img src="/theme/siren.png" alt="" className="relative block h-auto w-full" />
          ) : (
            <svg viewBox="0 0 40 40" className="relative block h-auto w-full">
              <path d="M8 34 L10 18 Q20 8 30 18 L32 34 Z" fill="#e5534b" stroke="#141416" strokeWidth="2" />
              <path d="M13 30 L14 20 Q17 16 20 15" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2" strokeLinecap="round" />
              <rect x="5" y="34" width="30" height="4" rx="1" fill="#141416" />
              <path d="M20 2 V7 M6 8 L9 11 M34 8 L31 11 M1 20 H5 M39 20 H35" stroke="#e5534b" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>
    </>
  );
}
