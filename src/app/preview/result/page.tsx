import { JudgeKarte } from "@/components/submit/judge-karte";
import { SubmissionView } from "@/components/submit/submission-view";
import { SamplePhoto } from "@/lib/sample/sample-photo";

export default function PreviewResultPage() {
  return (
    <div className="grid gap-5">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">振り返り提出 &amp; AI 検問</h1>
      <SubmissionView
        photo={<SamplePhoto passphrase="さくら 47" />}
        learned="固有値の出し方と対角化の手順"
        struggled="応用問題 3（重解のときの対角化）"
      />
      <JudgeKarte
        result={{
          score: 85,
          passed: true,
          passphraseFound: true,
          elapsedMinutes: 252,
          feedback:
            "固有値の計算から対角化まで、宣言した演習 10 問のうち 9 問が解かれています。重解のケースを言葉にできているのも良い点です。",
          disputeWindowEndsAt: "2026-10-16T21:15:00+09:00",
          attemptsLeft: 2,
        }}
      />
    </div>
  );
}
