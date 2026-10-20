import type { CSSProperties } from "react";
import { seeded } from "@/components/standing/theme-layer";
import type { UiThemeId } from "@/lib/theme/themes";

/**
 * The look theme the viewer picked (F16, ADR-045): the marker ui-themes.css keys on, and the scene
 * behind the page (moon and bats, string lights, light rays, hills and lanterns, …) with things
 * drifting through it. Purely decorative: fixed behind the content, never takes a tap, and still
 * under "reduce motion". Positions follow the design's phone frame; on a wide screen the scene
 * stays at the edges.
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

type ParticleKind = "leaf" | "bubble" | "snow" | "petal" | "star" | "dust";

const PARTICLES: Record<UiThemeId, ParticleKind | null> = {
  forest: "leaf",
  ocean: "bubble",
  snow: "snow",
  sakura: "petal",
  sunset: null,
  space: "star",
  halloween: null,
  christmas: "snow",
  newyear: "dust",
};

const COUNTS: Record<ParticleKind, number> = { leaf: 14, bubble: 16, snow: 34, petal: 18, star: 46, dust: 22 };

/** Same pieces on every render (no hydration mismatch, no reshuffle on navigation). */
function particles(kind: ParticleKind) {
  const r = seeded(kind.length * 17 + 3);
  return Array.from({ length: COUNTS[kind] }, (_, i) => {
    const dur = 9 + r() * 10;
    return {
      left: `${(r() * 100).toFixed(1)}%`,
      top: `${(r() * 100).toFixed(1)}%`,
      dur: `${(kind === "snow" ? dur + 4 : kind === "star" ? 2 + r() * 4 : kind === "dust" ? 6 + r() * 6 : dur).toFixed(1)}s`,
      sway: `${(3 + r() * 3).toFixed(1)}s`,
      delay: `${(-r() * dur).toFixed(1)}s`,
      size: { leaf: 9 + r() * 8, petal: 9 + r() * 8, bubble: 6 + r() * 16, snow: 3 + r() * 5, star: 1.5 + r() * 2.5, dust: 2 + r() * 3 }[kind],
      tint: i % 3,
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
      data-tint={piece.tint}
      style={
        {
          left: piece.left,
          "--top": piece.top,
          "--dur": piece.dur,
          "--sway": piece.sway,
          "--delay": piece.delay,
          width: piece.size,
          height: kind === "leaf" ? piece.size * 0.62 : kind === "petal" ? piece.size * 0.8 : piece.size,
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

const CONSTELLATION: [number, number][] = [
  [23, 150],
  [46, 120],
  [62, 200],
  [82, 170],
  [77, 260],
];

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
  forest: (
    <>
      {[8, 34, 62, 84].map((left, i) => (
        <S key={i} className="ui-ray" style={{ left: `${left}%`, animationDuration: `${6 + i}s`, animationDelay: `${-i * 2}s` }} />
      ))}
      <S className="ui-vine" style={{ right: -70, top: -40, width: 220, height: 260, rotate: "10deg" }} />
      <S className="ui-vine ui-vine-b" style={{ right: -30, top: 60, width: 140, height: 200 }} />
      {[
        [300, 40, 30],
        [330, 120, -40],
        [262, 170, 60],
        [350, 230, 10],
      ].map(([x, y, angle], i) => (
        <S key={i} className="ui-leaf" style={{ right: 390 - x - 30, top: y, rotate: `${angle}deg` }} />
      ))}
      <S className="ui-leaf" style={{ left: 8, top: 300, rotate: "-20deg" }} />
      <S className="ui-leaf" style={{ left: 4, top: "66%", rotate: "35deg" }} />
      <S style={{ left: -50, top: "45%", width: 150, height: 100, borderRadius: "0 100% 0 100%", background: "#2e5a22", filter: "blur(10px)", opacity: 0.45 }} />
      <S style={{ left: -40, top: "83%", width: 150, height: 100, borderRadius: "0 100% 0 100%", background: "#2e5a22", filter: "blur(10px)", opacity: 0.45 }} />
    </>
  ),
  ocean: (
    <>
      <S className="ui-caustic" style={{ inset: 0 }} />
      {[20, 42, 60, 78].map((left, i) => (
        <S
          key={i}
          className="ui-ray ui-ray-sea"
          style={{ left: `${left}%`, width: 60 + i * 12, rotate: `${-14 + i * 8}deg`, animationDuration: `${5 + i * 2}s`, animationDelay: `${-i}s` }}
        />
      ))}
      <S style={{ inset: "auto 0 0", height: 260, background: "linear-gradient(transparent, rgba(2,10,24,.6))" }} />
    </>
  ),
  snow: (
    <>
      <S className="ui-frost" style={{ inset: 0 }} />
      {[
        { left: -36, top: 30, size: 90 },
        { right: -30, top: -30, size: 70 },
        { left: -40, top: "76%", size: 80 },
        { right: -50, top: "71%", size: 100 },
      ].map(({ size, ...at }, i) => (
        <S key={i} className="ui-flake" style={{ ...at, width: size, height: size }} />
      ))}
    </>
  ),
  sakura: (
    <>
      {[
        [12, 34, 12],
        [38, 28, 14],
        [66, 40, 11],
        [88, 30, 15],
      ].map(([left, size, dur], i) => (
        <S
          key={i}
          className="ui-big-petal"
          style={{ left: `${left}%`, width: size, height: size * 0.8, animationDuration: `${dur}s, 4s`, animationDelay: `${-i * 3}s, 0s` }}
        />
      ))}
    </>
  ),
  sunset: (
    <>
      <S style={{ left: -80, right: -80, bottom: "26%", height: 160, borderRadius: "50% 50% 0 0", background: "#4a2a4a", opacity: 0.9 }} />
      <S style={{ left: -160, width: 380, bottom: "14%", height: 200, borderRadius: "50% 50% 0 0", background: "#2e1c36" }} />
      <S style={{ right: -120, width: 360, bottom: "10%", height: 200, borderRadius: "50% 50% 0 0", background: "#24162e" }} />
      <S style={{ inset: "auto 0 0", height: "16%", background: "#22182e" }} />
      {[
        { right: "14%", top: "19%", size: 16 },
        { left: 40, top: "56%", size: 12 },
        { right: 36, top: "56%", size: 14 },
        { left: "51%", top: "36%", size: 9 },
        { left: 80, top: "27%", size: 8 },
      ].map(({ size, ...at }, i) => (
        <S
          key={i}
          className="ui-lantern"
          style={{ ...at, width: size, height: size * 1.3, boxShadow: `0 0 ${size}px ${size / 3}px rgba(255,150,50,.55)`, animationDuration: `${8 + i * 2}s`, animationDelay: `${-i * 3}s` }}
        />
      ))}
      {[
        { right: 122, top: 90 },
        { right: 96, top: 108 },
        { left: 62, top: "62%" },
      ].map((at, i) => (
        <S key={i} className="ui-bird" style={at} />
      ))}
    </>
  ),
  space: (
    <>
      <S className="ui-nebula" style={{ inset: "-10%" }} />
      {CONSTELLATION.slice(1).map(([x2, y2], i) => {
        const [x1, y1] = CONSTELLATION[i];
        const dx = ((x2 - x1) / 100) * 390;
        const dy = y2 - y1;
        return (
          <S
            key={i}
            style={{ left: `${x1}%`, top: y1, width: Math.hypot(dx, dy), height: 1, background: "rgba(170,200,255,.35)", rotate: `${Math.atan2(dy, dx)}rad`, transformOrigin: "0 0" }}
          />
        );
      })}
      {CONSTELLATION.map(([x, y], i) => (
        <S key={i} style={{ left: `${x}%`, top: y - 2, width: 4, height: 4, borderRadius: 999, background: "#fff", boxShadow: "0 0 6px #fff" }} />
      ))}
      <S className="ui-shooting" style={{ top: 80, left: -120 }} />
    </>
  ),
};
