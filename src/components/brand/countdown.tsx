"use client";

import { useSyncExternalStore } from "react";

// Ticks once a minute; the server snapshot is null so the first render matches on both sides.
const subscribe = (onTick: () => void) => {
  const id = setInterval(onTick, 30_000);
  return () => clearInterval(id);
};
const getMinute = () => Math.floor(Date.now() / 60_000);
const getServerMinute = () => null;

/** "3:12" until `until`. Shows `fallback` before hydration and "0:00" once passed. */
export function Countdown({ until, fallback = "--:--" }: { until: string; fallback?: string }) {
  const minute = useSyncExternalStore(subscribe, getMinute, getServerMinute);
  if (minute === null) return <span>{fallback}</span>;

  const remaining = Math.max(0, Math.floor((new Date(until).getTime() - minute * 60_000) / 60_000));
  const hours = Math.floor(remaining / 60);
  const minutes = String(remaining % 60).padStart(2, "0");
  return (
    <time dateTime={until} className="tabular-nums">
      {hours}:{minutes}
    </time>
  );
}
