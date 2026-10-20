"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TERMS, type TermKey } from "@/lib/terms";
import { cn } from "@/lib/utils";

// The 「？」 next to a term (F15): tap for a short explanation. Unlike the coach marks, nothing is
// remembered; it is there every time. The words are in lib/terms.ts.

const GUTTER = 16;
const GAP = 8;
const MAX_WIDTH = 280;

export function TermHelp({ term, className }: { term: TermKey; className?: string }) {
  const { label, text } = TERMS[term];
  const [box, setBox] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!box) return;
    const close = () => setBox(null);
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (button.current?.contains(target) || bubble.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      button.current?.focus();
    };
    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [box]);

  let position: React.CSSProperties | undefined;
  if (box) {
    const width = Math.min(MAX_WIDTH, window.innerWidth - GUTTER * 2);
    const left = Math.min(Math.max(box.left + box.width / 2 - width / 2, GUTTER), window.innerWidth - GUTTER - width);
    // Below unless it's in the lower part of the screen.
    position =
      box.bottom < window.innerHeight * 0.6
        ? { top: box.bottom + GAP, left, width }
        : { bottom: window.innerHeight - box.top + GAP, left, width };
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`「${label}」とは`}
        aria-expanded={box !== null}
        aria-controls={box ? id : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setBox(box ? null : event.currentTarget.getBoundingClientRect());
        }}
        className={cn(
          "inline-grid size-5 shrink-0 place-items-center rounded-full border-2 border-ink bg-card align-middle font-en text-xs leading-none text-ink",
          box && "bg-tape",
          className,
        )}
      >
        ?
      </button>
      {box
        ? createPortal(
            <div
              ref={bubble}
              id={id}
              role="note"
              className="fixed z-40 grid animate-in gap-1 rounded-[12px] border-[2.5px] border-ink bg-card px-3.5 py-2.5 text-ink shadow-hard-sm fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
              style={position}
            >
              <b className="text-sm">{label}</b>
              <p className="m-0 text-xs leading-relaxed font-medium">{text}</p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
