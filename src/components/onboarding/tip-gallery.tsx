"use client";

import { useState } from "react";
import { Sticker } from "@/components/brand/sticker";
import type { TipKey } from "@/lib/tips";
import { CoachMark } from "./coach-mark";

export type GallerySample = { id: string; tip: TipKey; scene: string; text: string };

/** /preview/tips: every coach mark against a stand-in for what it points at. Nothing is recorded. */
export function TipGallery({ samples }: { samples: GallerySample[] }) {
  const [active, setActive] = useState<GallerySample | null>(null);
  return (
    <div className="grid gap-3">
      {samples.map((sample) => (
        <Sticker
          key={sample.id}
          shadow="sm"
          data-tip={active?.id === sample.id ? sample.tip : undefined}
          className="grid gap-1.5 px-3.5 py-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <code className="text-xs font-bold">{sample.tip}</code>
            <button
              type="button"
              onClick={() => setActive(sample)}
              className="rounded-full border-2 border-ink bg-mint px-3 py-0.5 text-xs font-black"
            >
              出す
            </button>
          </div>
          <span className="text-sm font-bold">{sample.scene}</span>
          <span className="text-xs font-medium text-sub">{sample.text}</span>
        </Sticker>
      ))}
      {active ? <CoachMark key={active.id} tip={active.tip} text={active.text} preview onClose={() => setActive(null)} /> : null}
    </div>
  );
}
