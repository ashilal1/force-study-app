"use client";

import { useEffect, useState } from "react";
import { Crown } from "./crown";

// Confetti on the home ranking when the crown has moved since this viewer last saw it (F14): a
// banner that opens above the list (pushing it down, never covering a name) and confetti behind
// the cards. The parent is a `relative isolate` grid with gap-3.
// "Seen" is a per-viewer convenience kept in this browser; without storage it just plays again.
// Under "reduce motion" it doesn't play.

const SEEN_KEY = "crown-confetti-seen";
const COLORS = ["#f2c94c", "#e5534b", "#3f9b7b", "#3d7fc4", "#7b5ea7", "#ff6a00", "#ffffff"];
const PIECES = Array.from({ length: 36 }, (_, i) => {
  // Spread out like a fan from the crown, a little different each piece (fixed, no Math.random in render).
  const angle = -150 + ((i * 137) % 120);
  const distance = 90 + ((i * 53) % 110);
  return {
    x: `${Math.round(Math.cos((angle * Math.PI) / 180) * distance * -1)}px`,
    y: `${Math.round(Math.sin((angle * Math.PI) / 180) * distance)}px`,
    fall: `${120 + ((i * 29) % 90)}px`,
    spin: `${(i % 2 ? 1 : -1) * (360 + ((i * 47) % 360))}deg`,
    delay: `${(i % 6) * 40}ms`,
    color: COLORS[i % COLORS.length],
    width: i % 3 === 0 ? 5 : 7,
    height: i % 3 === 0 ? 10 : 5,
  };
});

export function CrownConfetti({ eventId, name }: { eventId: string; name: string }) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = window.localStorage.getItem(SEEN_KEY);
    } catch {}
    if (seen === eventId) return;
    const markSeen = () => {
      try {
        window.localStorage.setItem(SEEN_KEY, eventId);
      } catch {}
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      markSeen();
      return;
    }
    const start = requestAnimationFrame(() => setPlaying(true));
    const stop = window.setTimeout(() => {
      setPlaying(false);
      markSeen();
    }, 3200);
    return () => {
      cancelAnimationFrame(start);
      window.clearTimeout(stop);
    };
  }, [eventId]);

  if (!playing) return null;
  return (
    <>
      <div className="flex animate-[crown-banner_3.2s_ease-out_forwards] justify-center overflow-hidden" role="status">
        <span className="mt-0.5 mb-1 inline-flex items-center gap-1.5 rounded-full border-[2.5px] border-ink bg-tape px-3 py-1 text-sm font-black whitespace-nowrap shadow-[2px_2px_0_var(--ink)]">
          <Crown className="w-5" />
          王冠が {name} さんに！
        </span>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-6 -z-10 h-0">
        {PIECES.map((piece, i) => (
          <span
            key={i}
            className="absolute top-2 left-1/2 animate-[crown-confetti_1.9s_cubic-bezier(0.2,0.7,0.4,1)_forwards] opacity-0"
            style={
              {
                "--x": piece.x,
                "--y": piece.y,
                "--fall": piece.fall,
                "--spin": piece.spin,
                animationDelay: piece.delay,
                width: piece.width,
                height: piece.height,
                background: piece.color,
                border: "1px solid var(--ink)",
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </>
  );
}
