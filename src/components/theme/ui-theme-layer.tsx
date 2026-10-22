import type { CSSProperties } from "react";
import { seeded } from "@/components/standing/theme-layer";
import type { UiThemeId } from "@/lib/theme/themes";

/**
 * The seasonal theme (F16, ADR-046): the marker ui-themes.css keys on, and the scene around the
 * page. Two layers, both behind the content, never taking a tap and still under "reduce motion":
 * - `.ui-backdrop` stays put while the page scrolls: the sky, snow or gold dust, and pieces that sit
 *   where text rarely goes (the bottom corners, the page's far edges on a wide screen).
 * - `.ui-top` belongs to the top of the page and scrolls away with it (the moon and bats, the string
 *   of lights, the shimenawa), so nothing busy stays behind the text further down.
 * The pictures are the owner's images in public/theme/<theme>/ (docs/visual-assets.md).
 */
export function UiThemeLayer({ theme }: { theme: UiThemeId }) {
  return (
    <>
      <div hidden data-ui-theme={theme} />
      <div aria-hidden className="ui-backdrop">
        {SCENES[theme]}
        <Particles kind={PARTICLES[theme]} />
      </div>
      <div aria-hidden className="ui-top">
        {TOPS[theme]}
      </div>
    </>
  );
}

type ParticleKind = "snow" | "dust";

const PARTICLES: Record<UiThemeId, ParticleKind | null> = {
  halloween: null,
  christmas: "snow",
  newyear: "dust",
};

const COUNTS: Record<ParticleKind, number> = { snow: 34, dust: 22 };

/** Same pieces on every render (no hydration mismatch, no reshuffle on navigation). */
function particles(kind: ParticleKind) {
  const r = seeded(kind.length * 17 + 3);
  return Array.from({ length: COUNTS[kind] }, () => {
    const dur = 9 + r() * 10;
    return {
      left: `${(r() * 100).toFixed(1)}%`,
      top: `${(r() * 100).toFixed(1)}%`,
      dur: `${(kind === "snow" ? dur + 4 : 6 + r() * 6).toFixed(1)}s`,
      sway: `${(3 + r() * 3).toFixed(1)}s`,
      delay: `${(-r() * dur).toFixed(1)}s`,
      size: { snow: 3 + r() * 5, dust: 2 + r() * 3 }[kind],
    };
  });
}

const PIECES = Object.fromEntries((Object.keys(COUNTS) as ParticleKind[]).map((kind) => [kind, particles(kind)])) as Record<
  ParticleKind,
  ReturnType<typeof particles>
>;

function Particles({ kind }: { kind: ParticleKind | null }) {
  if (!kind) return null;
  return PIECES[kind].map((piece, i) => (
    <span
      key={i}
      className={`ui-p ui-p-${kind}`}
      style={
        {
          left: piece.left,
          "--top": piece.top,
          "--dur": piece.dur,
          "--sway": piece.sway,
          "--delay": piece.delay,
          width: piece.size,
          height: piece.size,
        } as CSSProperties
      }
    />
  ));
}

/** An absolutely placed piece of the scene. */
function S({ className, style }: { className?: string; style: CSSProperties }) {
  return <span className={className ? `ui-s ${className}` : "ui-s"} style={style} />;
}

/** Bats crossing the top of the page: [index, top in px, seconds per crossing]. */
const BATS: [number, number, number][] = [
  [0, 44, 9],
  [1, 86, 12],
  [2, 132, 10],
  [3, 178, 14],
];

const SCENES: Record<UiThemeId, React.ReactNode> = {
  halloween: (
    <>
      <S style={{ inset: "auto 0 0", height: 220, background: "linear-gradient(transparent, rgba(150,90,200,.18))" }} />
      <S className="ui-trees" style={{ left: -34, bottom: 56 }} />
      <S className="ui-trees ui-flip" style={{ right: -34, bottom: 56 }} />
      <S className="ui-ghost ui-wide" style={{ left: "3vw", top: "38%", width: 44 }} />
      <S className="ui-ghost ui-wide" style={{ right: "3vw", top: "64%", width: 36, animationDuration: "4.2s", animationDelay: "-1s" }} />
    </>
  ),
  christmas: (
    <>
      {[
        [12, 18, 30],
        [78, 30, 44],
        [30, 52, 24],
        [88, 66, 36],
        [8, 78, 28],
      ].map(([left, top, size], i) => (
        <S key={i} style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, borderRadius: 999, background: "rgba(255,210,120,.25)", filter: "blur(4px)" }} />
      ))}
      <S className="ui-ribbon ui-wide" style={{ right: 0, top: 0 }} />
    </>
  ),
  newyear: (
    <>
      {[
        { right: -30, top: 70 },
        { left: -40, top: "36%" },
        { right: -50, top: "62%" },
      ].map((at, i) => (
        <S key={i} className={i === 1 ? "ui-cloud ui-flip" : "ui-cloud"} style={at} />
      ))}
      {[
        { right: 14, top: 40, size: 16, white: false },
        { left: 20, top: 120, size: 20, white: true },
        { right: 10, top: "43%", size: 24, white: false },
        { left: 12, top: "56%", size: 16, white: true },
        { right: 30, top: "77%", size: 20, white: false },
        { left: 40, top: "85%", size: 24, white: true },
      ].map(({ size, white, ...at }, i) => (
        <S key={i} className={white ? "ui-plum ui-plum-white" : "ui-plum"} style={{ ...at, width: size, height: size }} />
      ))}
    </>
  ),
};

const TOPS: Record<UiThemeId, React.ReactNode> = {
  halloween: (
    <>
      <S className="ui-moon" style={{ right: 20, top: 84 }} />
      {BATS.map(([i, top, dur]) => (
        <span key={i} className="ui-s ui-bat-path" style={{ top, animationDuration: `${dur}s`, animationDelay: `${-i * 3}s` }}>
          <span className="ui-bat" style={{ width: 22 + i * 4 }} />
        </span>
      ))}
    </>
  ),
  christmas: <S className="ui-lights" style={{ inset: "0 0 auto", height: 26 }} />,
  newyear: <S className="ui-rope" style={{ inset: "0 0 auto", height: 16 }} />,
};
