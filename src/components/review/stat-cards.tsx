import { Sticker } from "@/components/brand/sticker";
import type { Summary } from "@/lib/stats";

/** G1: four numbers at a glance. */
export function StatCards({ summary, label }: { summary: Summary; label: string }) {
  const cards = [
    { title: `${label}の達成率`, value: summary.rate === null ? "−" : `${summary.rate}%` },
    { title: "連続達成", value: `${summary.streak.current}日`, sub: `最長 ${summary.streak.best}日` },
    { title: "平均点", value: summary.avgScore === null ? "−" : `${summary.avgScore}` },
    {
      title: "ペナルティ",
      value: `${summary.penalty.toLocaleString()}円`,
      sub: summary.trialPenalty > 0 ? `本番なら +${summary.trialPenalty.toLocaleString()}円` : undefined,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {cards.map((card) => (
        <Sticker key={card.title} shadow="sm" className="grid gap-0.5 px-3 py-2.5">
          <span className="text-xs font-bold text-sub">{card.title}</span>
          <span className="font-en text-2xl leading-none">{card.value}</span>
          {card.sub ? <span className="text-[0.7rem] font-bold text-sub">{card.sub}</span> : null}
        </Sticker>
      ))}
    </div>
  );
}
