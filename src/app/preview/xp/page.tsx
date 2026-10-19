import { Sticker } from "@/components/brand/sticker";
import { XpTrendChart, type XpTrendLine } from "@/components/standing/xp-trend-chart";
import { MEMBER_COLORS } from "@/lib/chart-colors";
import type { XpTrendPoint } from "@/lib/standing/rules";
import { addDays } from "@/lib/time";

// Sample XP trends (F14): one member climbing through the ranks, and a race where the lead changes.

const TODAY = "2026-10-20";

/** 56 days from a daily pattern: "c" completed (+10), "9" completed with 90+ (+13), "s" slacked (-25), "-" nothing. */
function trend(pattern: string): XpTrendPoint[] {
  const gains = [...pattern.padEnd(56, "c")].map((char, index) => {
    const date = addDays(TODAY, index - 55);
    if (char === "c") return { date, events: [{ date, points: 10, label: "達成" }] };
    if (char === "9") return { date, events: [{ date, points: 10, label: "達成" }, { date, points: 3, label: "90 点以上" }] };
    if (char === "s") return { date, events: [{ date, points: -25, label: "サボった" }] };
    return { date, events: [] };
  });
  return gains.map(({ date, events }, index) => {
    const inWindow = gains.slice(Math.max(0, index - 27), index + 1);
    const xp = inWindow.flatMap((day) => day.events).reduce((sum, event) => sum + event.points, 0);
    const left = index >= 28 ? gains[index - 28].events.reduce((sum, event) => sum - event.points, 0) : 0;
    return { date, xp, leave: false, events, dropped: left };
  });
}

const solo: XpTrendLine[] = [{ id: "me", name: "あなた", color: "var(--ink)", points: trend("ss-s--c-c-cc-cccc9cc9c9c9cc9999c99c999c9999999999999999") }];

const race: XpTrendLine[] = [
  { id: "a", name: "あきら", color: MEMBER_COLORS[0], points: trend("ccccccccccccc--s--ss----cccccc-c-c-c--c-c-cc") },
  { id: "b", name: "べに", color: MEMBER_COLORS[1], points: trend("--c-c-c-cc-ccccc9ccccc9c9c9cc-cs---c--c-c-c-") },
  { id: "c", name: "ちょう", color: MEMBER_COLORS[2], points: trend("-----c-c--cc-c-cc-ccc-cc-cccc9c9c9c999c9c9c99c99") },
];

export default function PreviewXpPage() {
  return (
    <div className="grid gap-6">
      <Sticker className="grid gap-1.5 px-4 py-4">
        <h3 className="m-0 text-sm font-black">XP の推移（直近 8 週）</h3>
        <XpTrendChart lines={solo} />
      </Sticker>
      <div className="h-[60vh] text-sm text-sub">↓ スクロールすると、レースが始まります</div>
      <section className="grid gap-2.5">
        <h2 className="m-0 font-heading text-[1.15rem] leading-tight font-normal">XP レース（直近 8 週）</h2>
        <XpTrendChart race lines={race} />
      </section>
    </div>
  );
}
