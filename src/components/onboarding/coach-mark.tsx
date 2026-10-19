"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { markTipSeen } from "@/actions/onboarding";
import { Tape } from "@/components/brand/tape";
import type { TipKey } from "@/lib/tips";
import { cn } from "@/lib/utils";

// Closed in this tab already: going back can render the page again before the write lands.
const closedHere = new Set<string>();

type Box = { top: number; left: number; width: number; height: number };

const GUTTER = 16;
const GAP = 12;
/** Room the fixed bottom navigation takes. */
const NAV = 76;
const MAX_WIDTH = 320;

/**
 * A coach mark (F15): dims the screen except the element marked `data-tip={tip}` and says one thing
 * next to it. Nothing blocks the page — the dimming and the spotlight don't take pointer events, so
 * the element pointed at still works. Any tap or Escape closes it for good (rpc mark_tip_seen,
 * without waiting). The element may stream in after this, so it waits a while for it.
 */
export function CoachMark({
  tip,
  text,
  preview = false,
  onClose,
}: {
  tip: TipKey;
  text: string;
  /** /preview: closing doesn't record anything. */
  preview?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(() => preview || !closedHere.has(tip));
  const [box, setBox] = useState<Box | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(180);
  const visible = open && box !== null;
  // React 19 ref cleanup: follows the bubble's height while it is mounted.
  const bubble = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(() => setBubbleHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    let target: Element | null = null;
    let frame = 0;
    let shown = false;
    const cleanups: (() => void)[] = [];

    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!target || !shown) return;
        const rect = target.getBoundingClientRect();
        setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      });
    };

    const attach = (element: Element) => {
      target = element;
      // Let the rest of the page stream in and settle before pointing.
      const timer = window.setTimeout(() => {
        const rect = element.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight - NAV) {
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          element.scrollIntoView({
            block: rect.height > window.innerHeight * 0.5 ? "start" : "center",
            behavior: reduce ? "auto" : "smooth",
          });
        }
        shown = true;
        measure();
      }, 500);
      cleanups.push(() => window.clearTimeout(timer));

      window.addEventListener("scroll", measure, { capture: true, passive: true });
      window.addEventListener("resize", measure);
      const resize = new ResizeObserver(measure);
      resize.observe(element);
      resize.observe(document.body);
      cleanups.push(() => {
        window.removeEventListener("scroll", measure, { capture: true });
        window.removeEventListener("resize", measure);
        resize.disconnect();
      });
    };

    const selector = `[data-tip="${tip}"]`;
    const found = document.querySelector(selector);
    if (found) {
      attach(found);
    } else {
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (!element) return;
        observer.disconnect();
        attach(element);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      // Never appeared (a different state by now): don't show, don't record.
      const giveUp = window.setTimeout(() => observer.disconnect(), 10_000);
      cleanups.push(() => {
        observer.disconnect();
        window.clearTimeout(giveUp);
      });
    }

    return () => {
      cancelAnimationFrame(frame);
      for (const cleanup of cleanups) cleanup();
    };
  }, [open, tip]);

  useEffect(() => {
    if (!visible) return;
    const close = () => {
      setOpen(false);
      setBox(null);
      onClose?.();
      if (preview) return;
      closedHere.add(tip);
      markTipSeen(tip).catch(() => {});
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    // Capture, and no preventDefault: the tap still does what it would have done.
    document.addEventListener("click", close, { capture: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close, { capture: true });
      document.removeEventListener("keydown", onKey);
    };
  }, [visible, tip, preview, onClose]);

  if (!visible || !box) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(MAX_WIDTH, viewportWidth - GUTTER * 2);
  const left = Math.min(Math.max(box.left + box.width / 2 - width / 2, GUTTER), viewportWidth - GUTTER - width);
  const arrow = Math.min(Math.max(box.left + box.width / 2 - left, 22), width - 22);
  const bottom = box.top + box.height;
  const place =
    bottom + GAP + bubbleHeight <= viewportHeight - NAV
      ? "below"
      : box.top - GAP - bubbleHeight >= GUTTER
        ? "above"
        : "inside";
  const position: React.CSSProperties =
    place === "below"
      ? { top: bottom + GAP, left, width }
      : place === "above"
        ? { bottom: viewportHeight - box.top + GAP, left, width }
        : { bottom: NAV + GAP, left, width };

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40">
      <div
        aria-hidden
        className="absolute rounded-[16px] border-[3px] border-tape shadow-[0_0_0_200vmax_rgb(26_26_26/0.45)] transition-[top,left,width,height] duration-150 motion-reduce:transition-none"
        style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }}
      />
      <div
        ref={bubble}
        role="status"
        className="pointer-events-auto absolute grid animate-in gap-2.5 rounded-[14px] border-[3px] border-ink bg-card px-4 pt-4 pb-3 text-ink shadow-hard fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none"
        style={position}
      >
        {/* Clear of the arrow when it comes out of the top edge. */}
        <Tape
          className={
            place !== "below" ? "-top-3 left-1/2 -translate-x-1/2" : arrow < width / 2 ? "-top-3 right-5" : "-top-3 left-5"
          }
        />
        {place === "inside" ? null : (
          <span
            aria-hidden
            className={cn(
              "absolute size-3.5 rotate-45 border-ink bg-card",
              place === "below" ? "-top-[9px] border-t-[3px] border-l-[3px]" : "-bottom-[9px] border-r-[3px] border-b-[3px]",
            )}
            style={{ left: arrow - 7 }}
          />
        )}
        <span className="font-hand text-sm leading-none text-sub">はじめてのヒント</span>
        <p className="m-0 text-sm leading-relaxed font-bold">{text}</p>
        <button
          type="button"
          className="justify-self-end rounded-full border-[2.5px] border-ink bg-mint px-4 py-1 text-sm font-black shadow-hard-sm"
        >
          わかった
        </button>
      </div>
    </div>,
    document.body,
  );
}
