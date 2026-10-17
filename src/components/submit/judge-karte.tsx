import { Karte } from "@/components/brand/karte";
import { Stamp } from "@/components/brand/stamp";
import { formatJstTime } from "@/lib/time";

export type JudgeResult = {
  score: number;
  passed: boolean;
  passphraseFound: boolean;
  elapsedMinutes: number;
  feedback: string;
  disputeWindowEndsAt: string | null;
  attemptsLeft: number;
  /** Past or resent submissions: no "what happens next" line. */
  hideFooter?: boolean;
};

function elapsed(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} 時間 ${m} 分` : `${m} 分`;
}

export function JudgeKarte({ result }: { result: JudgeResult }) {
  return (
    <Karte title="AI 検問カルテ" className={result.passed ? undefined : "bg-[#f6c9c5]"}>
      <div className="flex items-baseline justify-center gap-1.5">
        <b className="font-en text-[3.4rem] leading-none font-normal">{result.score}</b>
        <span className="font-en text-xl">/ 100</span>
        <Stamp tone={result.passed ? "ink" : "red"} label={result.passed ? "合格" : "不合格"} className="ml-2 bg-transparent text-xl" />
      </div>
      <ul className="m-0 flex list-none flex-wrap justify-center gap-2 p-0 text-[0.78rem]">
        <li className="rounded-full border-[2.5px] border-ink bg-card px-2.5 py-0.5">
          合言葉 {result.passphraseFound ? "✓" : "✕ 見つからない"}
        </li>
        <li className="rounded-full border-[2.5px] border-ink bg-card px-2.5 py-0.5">宣言から {elapsed(result.elapsedMinutes)}</li>
      </ul>
      <p className="m-0 text-sm leading-relaxed font-medium">{result.feedback}</p>
      {result.hideFooter ? null : (
        <p className="m-0 text-center text-[0.78rem] font-bold">
          {result.passed && result.disputeWindowEndsAt
            ? `${formatJstTime(result.disputeWindowEndsAt)} まで、ほかのメンバーが「怪しい」を押せます`
            : `締切までに あと ${result.attemptsLeft} 回 提出し直せます`}
        </p>
      )}
    </Karte>
  );
}
