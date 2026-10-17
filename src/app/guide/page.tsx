import type { Metadata } from "next";
import Link from "next/link";
import { Sticker } from "@/components/brand/sticker";
import { NotificationHelp } from "@/components/notifications/notification-help";

export const metadata: Metadata = { title: "使い方 | Commit or Treat" };

// The guide for new members (M9): readable before signing in, so it can be sent along with an
// invite code. Static on purpose: no group data, so the numbers are the defaults.
// Gemini terms checked 2026-10 (Unpaid Services, last modified 2026-03-23).

const INSTALL = [
  {
    label: "iPhone",
    note: "iPhone は、ホーム画面に追加しないと通知が届きません（iOS 16.4 以降）。",
    steps: [
      "Safari でこのアプリを開く（Chrome などでは追加できないことがあります）",
      "下の共有ボタン（□ に ↑）を押す",
      "「ホーム画面に追加」を押す（見つからなければ一覧を下にスクロール）",
      "「Web アプリとして開く」はオンのまま「追加」",
      "これからは、ホーム画面のアイコンから開く",
    ],
  },
  {
    label: "Android",
    note: "追加しなくても通知は届きますが、アプリのように開けて便利です。",
    steps: [
      "Chrome でこのアプリを開く",
      "右上の「︙」→「ホーム画面に追加」（または「アプリをインストール」）",
      "「インストール」を押す",
    ],
  },
  {
    label: "PC（Chrome / Edge）",
    note: "PC ではブラウザのタブのままでも使えます。",
    steps: ["アドレスバーの右にあるインストールのアイコンを押す", "「インストール」を押す"],
  },
];

const DAY = [
  { title: "0:00〜12:00 宣言", body: "今日やることを決める。宣言すると今日の合言葉が出ます。" },
  { title: "次の日の 12:00 まで 提出", body: "成果物（ノートや画面）と合言葉を書いた紙を一緒に撮って、学んだことと振り返りを書く。夜中に出してもかまいません。" },
  { title: "AI が判定", body: "Gemini が内容と合言葉を見て点数を付けます。合格点に届かなければ、回数の上限まで出し直せます。" },
  { title: "できなかったら 理由を申告", body: "「できなかった」を押して、次の日の 23:00 までに理由を書く。理由によってペナルティが変わります。" },
];

const PENALTIES = [
  ["12:00 までに宣言しなかった", "500円"],
  ["未達成で、理由が「サボった」", "700円"],
  ["未達成で、理由が「宣言が妥当じゃなかった」", "0円（4 回続いたら 4 回目から 500円）"],
  ["未達成で、理由が「急な予定」「その他」", "全員が納得したら 0円、だめなら 500円"],
  ["次の日の 23:00 までに理由を申告しなかった", "700円"],
  ["「軽すぎる」と言われて 1 時間以内に書き直さなかった", "500円"],
  ["「怪しい」と言われて、送り直しても却下された", "200円"],
  ["精算を次の週の土曜までに払わなかった", "500円（払うまで毎週）"],
];

export default function GuidePage() {
  return (
    <main className="mx-auto grid w-full max-w-[440px] gap-7 px-4 pt-6 pb-16 md:max-w-[720px] md:px-6">
      <header className="grid gap-2">
        <p className="m-0 font-en text-[clamp(1.4rem,7vw,1.8rem)] leading-none whitespace-nowrap [text-shadow:3px_3px_0_#fff,5px_5px_0_var(--ink)]">
          COMMIT OR TREAT
        </p>
        <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">はじめての人へ</h1>
        <p className="m-0 text-sm leading-relaxed font-medium text-sub">
          毎日「宣言 → 提出 → AI の判定」をして、できなかった日はペナルティを払う、友達どうしの強制学習アプリです。始める前に、次の
          4 つを確かめてください。
        </p>
      </header>

      <Section number={1} title="1 日の流れ">
        <ol className="m-0 grid list-none gap-2 p-0">
          {DAY.map((step) => (
            <li key={step.title}>
              <Sticker shadow="sm" className="grid gap-0.5 px-3.5 py-2.5">
                <b className="text-sm">{step.title}</b>
                <span className="text-sm leading-relaxed font-medium">{step.body}</span>
              </Sticker>
            </li>
          ))}
        </ol>
        <p className="m-0 text-xs leading-relaxed text-sub">
          前の日の分が終わる（合格するか、理由を申告する）まで、次の日の宣言はできません。ほかのメンバーは、宣言に「軽すぎる」、合格した提出に
          24 時間「怪しい」を押せます。休みたい日は前の日までに休息日（週 1 日まで）にできます。
        </p>
      </Section>

      <Section number={2} title="ホーム画面に追加する">
        <Toggles items={INSTALL} />
      </Section>

      <Section number={3} title="通知を ON にする">
        <p className="m-0 text-sm leading-relaxed font-medium">
          締切や審査のお知らせは、すべてアプリの通知で届きます。ログインすると最初に通知の設定画面が出るので、「許可」を押してください。バナーが出ない・音が鳴らないときは、端末ごとの手順を見てください。
        </p>
        <NotificationHelp />
      </Section>

      <Section number={4} title="写真と記録の扱い">
        <Sticker tone="tape" shadow="sm" className="grid gap-1 px-3.5 py-3">
          <b className="text-sm">写真に個人情報を写さない</b>
          <p className="m-0 text-sm leading-relaxed font-medium">
            AI の判定には Google の Gemini API を無料枠で使っています。無料枠では、送った写真や文章が Google
            のサービスの改善に使われ、Google の担当者が読むことがあります（アカウントとは切り離されます）。
          </p>
          <p className="m-0 text-sm leading-relaxed font-medium">
            顔・名前・住所・学校や会社の名前・ほかの人・通知や画面に映った個人情報は写さないでください。
          </p>
        </Sticker>
        <ul className="m-0 grid list-disc gap-1 pl-5 text-sm leading-relaxed font-medium">
          <li>写真と記録は、グループのメンバー全員が見られます。</li>
          <li>写真の原寸は 60 日（グループの設定）で消えます。小さいサムネイルと文字の記録はずっと残ります。</li>
          <li>記録はあとから書き換えたり消したりできません。</li>
          <li>自分の記録は「設定」→「記録の書き出し」でいつでもダウンロードできます。</li>
        </ul>
      </Section>

      <Section title="ペナルティとお金">
        <p className="m-0 text-sm leading-relaxed font-medium">
          1pt = 1 円。毎週土曜 23:59 に締めて、決めておいた支払先に PayPay で払います。参加した週は日曜 0:00
          までお試し期間で、ペナルティは付きません（「本番なら 〇円」と表示だけされます）。
        </p>
        <div className="overflow-hidden rounded-[12px] border-[2.5px] border-ink bg-card">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {PENALTIES.map(([when, amount]) => (
                <tr key={when} className="border-b border-dashed border-ink/40 last:border-0">
                  <td className="px-3 py-2 font-medium">{when}</td>
                  <td className="w-[42%] px-3 py-2 text-right font-bold">{amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-xs text-sub">金額は既定の値です。グループの設定で変わることがあります。1 日に付くのは 1 件までです。</p>
      </Section>

      <Link href="/" className="text-center text-sm font-bold underline underline-offset-2">
        アプリを開く →
      </Link>
    </main>
  );
}

function Section({ number, title, children }: { number?: number; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h2 className="m-0 flex items-center gap-2 font-heading text-[1.2rem] leading-tight font-normal">
        {number ? (
          <span className="grid size-7 place-items-center rounded-full border-[2.5px] border-ink bg-mint font-en text-sm">{number}</span>
        ) : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Toggles({ items }: { items: { label: string; note: string; steps: string[] }[] }) {
  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        <details
          key={item.label}
          open={index === 0}
          className="group rounded-[12px] border-[2.5px] border-ink bg-card open:shadow-hard-sm"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 font-bold [&::-webkit-details-marker]:hidden">
            {item.label}
            <span aria-hidden className="transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="grid gap-2 border-t-2 border-dashed border-ink px-3.5 pt-2.5 pb-3.5 text-sm leading-relaxed font-medium">
            <p className="m-0 text-xs text-sub">{item.note}</p>
            <ol className="m-0 grid list-decimal gap-1 pl-5">
              {item.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </details>
      ))}
    </div>
  );
}
