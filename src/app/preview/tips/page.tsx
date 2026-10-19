import { TermHelp } from "@/components/onboarding/term-help";
import { TipGallery, type GallerySample } from "@/components/onboarding/tip-gallery";
import { TERM_KEYS } from "@/lib/terms";
import { TIPS } from "@/lib/tips";

// Every coach mark (F15) with the default settings. 「出す」 points it at its card.
const SAMPLES: GallerySample[] = [
  { id: "home_todo", tip: "home_todo", scene: "ホームを開いた → 「あなたがやること」", text: TIPS.home_todo },
  { id: "declare_input", tip: "declare_input", scene: "宣言の画面 → 入力欄", text: TIPS.declare_input },
  { id: "passphrase", tip: "passphrase", scene: "宣言した直後 → 合言葉", text: TIPS.passphrase },
  { id: "give_up", tip: "give_up", scene: "宣言の画面（提出待ち）→ 「できなかった」", text: TIPS.give_up },
  { id: "submit_photos", tip: "submit_photos", scene: "提出の画面 → 写真", text: TIPS.submit_photos },
  {
    id: "judge_result-passed",
    tip: "judge_result",
    scene: "判定の結果（合格）→ カルテ",
    text: TIPS.judge_result({ passed: true, attemptsLeft: 2, disputeHours: 24 }),
  },
  {
    id: "judge_result-rejected",
    tip: "judge_result",
    scene: "判定の結果（不合格）→ カルテ",
    text: TIPS.judge_result({ passed: false, attemptsLeft: 2, disputeHours: 24 }),
  },
  { id: "peer_buttons", tip: "peer_buttons", scene: "ほかの人のカード → 「軽すぎる？」「怪しい？」", text: TIPS.peer_buttons },
  {
    id: "flagged-declaration",
    tip: "flagged",
    scene: "宣言が「軽すぎる」→ 書き直し",
    text: TIPS.flagged({ target: "declaration", dueAt: "10:42" }),
  },
  {
    id: "flagged-submission",
    tip: "flagged",
    scene: "提出が「怪しい」→ 送り直し",
    text: TIPS.flagged({ target: "submission", dueAt: "10/20(火) 21:10" }),
  },
  { id: "report", tip: "report", scene: "理由申告 → 理由の選択肢", text: TIPS.report({ excuseRejected: 500 }) },
  {
    id: "review-excuse",
    tip: "review",
    scene: "理由の審査 → 納得・納得できない",
    text: TIPS.review({ target: "excuse", yen: 500 }),
  },
  {
    id: "review-dispute",
    tip: "review",
    scene: "「怪しい」の最終審査 → 認める・却下する",
    text: TIPS.review({ target: "dispute", yen: 200 }),
  },
  { id: "settlement", tip: "settlement", scene: "精算 → PayPay と「送金した」", text: TIPS.settlement({ lateYen: 500 }) },
];

export default function PreviewTipsPage() {
  return (
    <div className="grid gap-4">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">コーチマーク</h1>
      <TipGallery samples={SAMPLES} />

      <h2 className="m-0 mt-4 font-heading text-[1.2rem] leading-tight font-normal">用語の「？」</h2>
      <ul className="m-0 grid list-none gap-2 p-0">
        {TERM_KEYS.map((term) => (
          <li key={term} className="flex items-center gap-2 text-sm font-bold">
            <code className="text-xs">{term}</code>
            <TermHelp term={term} />
          </li>
        ))}
      </ul>
    </div>
  );
}
