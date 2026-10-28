import { Sticker } from "@/components/brand/sticker";
import { TITLES, xpWindowDates, type Standing, type TitleId } from "@/lib/standing/rules";
import { formatJstDay } from "@/lib/time";
import { Crown } from "./crown";
import { RankGauge } from "./rank-badge";
import { cardTheme } from "./theme-layer";
import { TitleBadge } from "./title-badges";
import { XpTrendChart } from "./xp-trend-chart";

/**
 * A member's rank, XP and its last 8 weeks, titles and the last 28 days of XP (F13, F14), on their
 * retrospective. The panel wears the member's rank look (ADR-049).
 */
export function StandingPanel({ standing, name, pastTitles = [] }: { standing: Standing; name: string; pastTitles?: TitleId[] }) {
  const earlier = pastTitles.filter((id) => TITLES[id] && !standing.titles.some((title) => title.id === id));
  const window = xpWindowDates(standing);
  const recent = standing.events.filter((event) => window.has(event.date)).reverse();
  return (
    <Sticker className="grid gap-3 px-4 py-4" {...cardTheme(standing.rank.id)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RankGauge standing={standing} />
        {standing.crown ? (
          <span className="inline-flex items-center gap-1 text-sm font-black">
            <Crown className="w-6" />
            グループ 1 位
          </span>
        ) : null}
      </div>
      <p className="m-0 text-xs font-bold text-sub">
        ランクは直近 28 日の XP で決まります（休会の日は数えません）。通算 {standing.totalXp} XP
      </p>

      <section className="grid gap-1.5">
        <h3 className="m-0 text-sm font-black">XP の推移（直近 8 週）</h3>
        <XpTrendChart lines={[{ id: standing.memberId, name, color: "var(--ink)", points: standing.trend }]} />
      </section>

      {standing.titles.length > 0 ? (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {standing.titles.map((title) => (
            <li key={title.id} className="grid gap-0.5">
              <span>
                <TitleBadge title={title} size="lg" />
              </span>
              <span className="text-xs font-medium text-sub">
                {TITLES[title.id].how}。{TITLES[title.id].until}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm font-medium">いま付いている称号はありません。</p>
      )}

      {earlier.length > 0 ? (
        <p className="m-0 text-xs font-bold text-sub">
          これまでに付いた称号: {earlier.map((id) => TITLES[id].name).join("・")}
        </p>
      ) : null}

      {recent.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-bold">直近 28 日の XP の内訳</summary>
          <ul className="m-0 mt-2 grid list-none gap-1 p-0">
            {recent.map((event, index) => (
              <li key={`${event.date}-${index}`} className="flex justify-between gap-2 tabular-nums">
                <span>
                  {formatJstDay(event.date)} {event.label}
                </span>
                <b className={event.points < 0 ? "text-red" : undefined}>
                  {event.points > 0 ? "+" : ""}
                  {event.points}
                </b>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Sticker>
  );
}
