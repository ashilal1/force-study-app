import { Avatar } from "@/components/brand/avatar";
import { PassphraseCard } from "@/components/declare/passphrase-card";
import { Sticker } from "@/components/brand/sticker";
import { CrownConfetti } from "@/components/standing/crown-confetti";
import { RankBadge } from "@/components/standing/rank-badge";
import { cardTheme } from "@/components/standing/theme-layer";
import { TitleBadge } from "@/components/standing/title-badges";
import { XpTrendChart, type XpTrendLine } from "@/components/standing/xp-trend-chart";
import { MEMBER_COLORS } from "@/lib/chart-colors";
import { RANKS, TITLES, type Standing, type TitleId, type XpTrendPoint } from "@/lib/standing/rules";
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
      {/* Every rank and title badge (F13, F14), small as on cards and large as on the retrospective. */}
      <Sticker className="grid gap-3 px-4 py-4">
        <div className="flex flex-wrap gap-2">
          {RANKS.map((rank) => (
            <RankBadge key={rank.id} standing={{ rank, xp: rank.min } as Standing} />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TITLES) as TitleId[]).map((id) => (
            <TitleBadge key={id} title={{ id, trial: false }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TITLES) as TitleId[]).map((id) => (
            <TitleBadge key={id} title={{ id, trial: false }} size="lg" />
          ))}
        </div>
      </Sticker>
      {/* Member cards wear the member's rank look, whatever the viewer's (ADR-049): try the bar. */}
      <section className="grid gap-3">
        <h2 className="m-0 font-en text-[1.4rem] leading-none">MEMBER CARDS</h2>
        {RANKS.map((rank, index) => (
          <Sticker key={rank.id} className="grid gap-2.5 px-3.5 py-3" {...cardTheme(rank.id)}>
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
              <Avatar name={rank.name} colorIndex={index} />
              <div className="min-w-0">
                <p className="m-0 truncate font-heading text-[1.2rem] leading-tight">{rank.name}の人</p>
                <p className="m-0 truncate text-sm font-bold">締切 10/20（月）21:00</p>
              </div>
            </div>
            <span>
              <RankBadge standing={{ rank, xp: rank.min } as Standing} />
            </span>
            <p className="m-0 text-sm leading-snug font-medium">英単語 300 語を 2 周して、間違えた 40 語をノートにまとめる</p>
            <PassphraseCard value="さくら 42" compact />
            <p className="m-0 text-xs font-bold text-sub">1 回目は不合格（62 点）</p>
          </Sticker>
        ))}
      </section>
      {/* The crown moved: once per browser (clear localStorage "crown-confetti-seen" to see it again). */}
      <section className="relative isolate grid gap-3">
        <CrownConfetti eventId="preview-crown" name="ちょう" />
        <h2 className="m-0 font-en text-[1.4rem] leading-none">RANKING</h2>
        {["ちょう 316 XP", "あきら 210 XP", "べに 155 XP"].map((row, index) => (
          <Sticker key={row} shadow="sm" className="px-3 py-2 font-bold">
            {index + 1}. {row}
          </Sticker>
        ))}
      </section>
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
