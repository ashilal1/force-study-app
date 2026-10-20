import type { CSSProperties } from "react";
import { seeded } from "@/components/standing/theme-layer";
import type { UiThemeId } from "@/lib/theme/themes";

/**
 * The seasonal theme (F16, ADR-046): the marker ui-themes.css keys on, and the scene behind the
 * page (moon and bats, string lights, clouds and plum blossoms) with snow or gold dust drifting
 * through it. Purely decorative: fixed behind the content, never takes a tap, and still under
 * "reduce motion". Positions follow the design's phone frame; on a wide screen the scene stays at
 * the edges.
 */
export function UiThemeLayer({ theme }: { theme: UiThemeId }) {
  return (
    <>
      <div hidden data-ui-theme={theme} />
      <div aria-hidden className="ui-backdrop">
        {SCENES[theme]}
        <Particles kind={PARTICLES[theme]} />
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

const BATS: [number, number, number][] = [
  [0, 18, 9],
  [1, 26, 12],
  [2, 40, 10],
  [3, 62, 14],
];

const LIGHTS = Array.from({ length: 15 }, (_, i) => {
  const t = (i - 7) / 7;
  return { left: `${1.5 + i * 6.9}%`, top: 14 + 30 * (1 - t * t), color: ["#ffd27a", "#fff2c8", "#ffb0a0"][i % 3], dur: 1.4 + (i % 4) * 0.4, delay: -i * 0.3 };
});

const SCENES: Record<UiThemeId, React.ReactNode> = {
  halloween: (
    <>
      <S className="ui-moon" style={{ right: 24, top: 96 }} />
      {BATS.map(([i, top, dur]) => (
        <span key={i} className="ui-s ui-bat-path" style={{ top: `${top}%`, animationDuration: `${dur}s`, animationDelay: `${-i * 3}s` }}>
          <span className="ui-bat" style={{ width: 20 + i * 4, height: (20 + i * 4) * 0.45 }} />
        </span>
      ))}
      <S className="ui-ghost" style={{ left: 4, bottom: "22%", width: 26, height: 30 }} />
      <S className="ui-ghost" style={{ right: 6, top: "36%", width: 22, height: 25, animationDuration: "4.2s", animationDelay: "-1s" }} />
      <S style={{ inset: "auto 0 0", height: 220, background: "linear-gradient(transparent, rgba(150,90,200,.18))" }} />
    </>
  ),
  christmas: (
    <>
      {LIGHTS.map((light, i) => (
        <S
          key={i}
          className="ui-bulb"
          style={{ left: light.left, top: light.top, background: light.color, animationDuration: `${light.dur}s`, animationDelay: `${light.delay}s` }}
        />
      ))}
      <S className="ui-ribbon" style={{ right: -50, top: 40 }} />
      {[
        [12, 18, 30],
        [78, 30, 44],
        [30, 52, 24],
        [88, 66, 36],
        [8, 78, 28],
      ].map(([left, top, size], i) => (
        <S key={i} style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, borderRadius: 999, background: "rgba(255,210,120,.25)", filter: "blur(4px)" }} />
      ))}
    </>
  ),
  newyear: (
    <>
      {[
        { right: -20, top: 70 },
        { left: -30, top: "36%" },
        { right: -40, top: "62%" },
      ].map((at, i) => (
        <S key={i} className="ui-cloud" style={at} />
      ))}
      {[
        { right: 14, top: 40, size: 16, white: false },
        { left: 20, top: 120, size: 20, white: true },
        { right: 10, top: "43%", size: 24, white: false },
        { left: 12, top: "56%", size: 16, white: true },
        { right: 30, top: "77%", size: 20, white: false },
        { left: 40, top: "85%", size: 24, white: true },
      ].map(({ size, white, ...at }, i) => (
        <S key={i} className="ui-plum" style={{ ...at, width: size, height: size, ["--petal" as string]: white ? "#ffffff" : "#f8c6cc" }} />
      ))}
    </>
  ),
};
