"use client";

import { useRef, useState } from "react";
import { acceptRules, finishIntroAgain } from "@/actions/onboarding";
import { ActionButton } from "@/components/brand/action-button";
import { Sticker } from "@/components/brand/sticker";
import { Tape } from "@/components/brand/tape";
import { SubmitButton } from "@/components/form/submit-button";
import type { IntroData } from "@/lib/intro";
import { cn } from "@/lib/utils";

/**
 * The intro lecture (F15): six cards to swipe through. The only way out is the last card's button,
 * so nobody skips it. With `again` (from settings) the button just closes.
 * `preview` swaps the actions for a no-op (dev gallery).
 */
export function IntroCards({ data, again = false, preview = false }: { data: IntroData; again?: boolean; preview?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const cards = buildCards(data, again);
  const last = cards.length - 1;

  function goTo(next: number) {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div className="grid gap-4">
      <div
        ref={track}
        onScroll={(event) => {
          const el = event.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        role="region"
        aria-roledescription="カルーセル"
        aria-label="はじめに"
        className="-mx-4 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card, i) => (
          <section
            key={card.title}
            aria-roledescription="スライド"
            aria-label={`${i + 1} / ${cards.length}`}
            className="w-full shrink-0 snap-center px-4 pt-4 pb-2"
          >
            <Sticker className="relative grid min-h-[420px] content-start gap-4 px-5 pt-7 pb-6">
              <Tape className="-top-3 left-1/2 -translate-x-1/2" />
              <div className="grid gap-1">
                <span className="font-en text-sm text-sub">
                  {i + 1} / {cards.length}
                </span>
                <h2 className="m-0 font-heading text-[1.45rem] leading-tight font-normal">{card.title}</h2>
              </div>
              {card.body}
              {i === last ? (
                preview ? (
                  <ActionButton type="button" tone="mint" hint="（プレビュー）">
                    {again ? "閉じる" : "このルールで始める"}
                  </ActionButton>
                ) : again ? (
                  <form action={finishIntroAgain}>
                    <SubmitButton tone="mint" pendingLabel="閉じています…">
                      閉じる
                    </SubmitButton>
                  </form>
                ) : (
                  <form action={acceptRules}>
                    <SubmitButton tone="mint" pendingLabel="記録中…" hint="次は通知の設定です">
                      このルールで始める
                    </SubmitButton>
                  </form>
                )
              ) : null}
            </Sticker>
          </section>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <ActionButton type="button" tone="white" className="w-auto px-4 py-2 text-base" disabled={index === 0} onClick={() => goTo(index - 1)}>
          戻る
        </ActionButton>
        <div className="flex gap-1.5" aria-hidden>
          {cards.map((card, i) => (
            <span
              key={card.title}
              className={cn("size-2.5 rounded-full border-2 border-ink", i === index ? "bg-ink" : "bg-card")}
            />
          ))}
        </div>
        <ActionButton
          type="button"
          tone="mint"
          className={cn("w-auto px-4 py-2 text-base", index === last && "invisible")}
          onClick={() => goTo(index + 1)}
        >
          次へ
        </ActionButton>
      </div>
    </div>
  );
}

const text = "m-0 text-sm leading-relaxed font-medium";

function buildCards(d: IntroData, again: boolean): { title: string; body: React.ReactNode }[] {
  return [
    {
      title: "このアプリでやること",
      body: (
        <>
          <p className={text}>毎日、勉強することを宣言して、やった証拠を出し、AI に判定してもらいます。</p>
          <ol className="m-0 grid list-none gap-2 p-0">
            {["宣言する", "成果物を提出する", "AI が判定する"].map((step, i) => (
              <li key={step} className="flex items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border-[2.5px] border-ink bg-mint font-en text-sm">
                  {i + 1}
                </span>
                <b className="text-base">{step}</b>
              </li>
            ))}
          </ol>
          <p className={text}>
            できなかった日は、理由を申告して<b>お金を払います</b>。仲間どうしで見張り合うので、ごまかしは効きません。
          </p>
        </>
      ),
    },
    {
      title: "1 日の流れ",
      body: (
        <>
          <ol className="m-0 grid list-none gap-0 border-l-[3px] border-ink p-0 pl-4">
            {[
              ["0:00", "1 日が始まる。宣言できるようになる"],
              [`〜${d.declarationCutoff}`, `今日やることを宣言する（${d.reminderTime} にまだなら通知が届く）`],
              [`翌日 ${d.declarationCutoff}`, "までに成果物を提出する。夜中でもいい"],
              ["提出したら", `AI がすぐ判定。${d.passingScore} 点以上で合格。1 日 ${d.maxAttempts} 回まで出し直せる`],
            ].map(([time, what]) => (
              <li key={time} className="relative grid gap-0.5 pb-3 before:absolute before:top-1 before:-left-[23px] before:size-3 before:rounded-full before:border-[2.5px] before:border-ink before:bg-tape">
                <b className="font-en text-base leading-none">{time}</b>
                <span className={text}>{what}</span>
              </li>
            ))}
          </ol>
          <p className={cn(text, "text-sub")}>
            前の日の分が終わる（合格するか、「できなかった」を押して理由を申告する）まで、次の日の宣言はできません。
          </p>
        </>
      ),
    },
    {
      title: "合言葉を写す",
      body: (
        <>
          <p className={text}>宣言すると、その日だけの合言葉が出ます。紙に書いて、成果物と一緒に写してください。</p>
          <div aria-hidden className="relative h-[150px] overflow-hidden rounded-[10px] border-[2.5px] border-ink bg-[repeating-linear-gradient(#fffdf6_0_22px,#cfd8e3_22px_23px)]">
            <span className="absolute top-3 left-4 font-hand text-sm text-sub">ノート・問題集・画面など</span>
            <div className="absolute right-5 bottom-4 rotate-[-5deg] rounded-[6px] border-2 border-ink bg-tape px-3 py-1.5 shadow-hard-sm">
              <span className="font-hand text-[1.5rem] leading-none font-semibold">さくら 47</span>
            </div>
          </div>
          <p className={text}>
            <b>写っていないと不合格</b>です。昔の写真やネットの画像は合言葉が写っていないので使えません。
          </p>
        </>
      ),
    },
    {
      title: "みんなが見ている",
      body: (
        <>
          <ul className="m-0 grid list-none gap-2 p-0">
            <li className={text}>
              <b>「軽すぎる」</b>: 宣言から {d.flagHours} 時間、ほかの人が押せます。押されたら書き直し。
            </li>
            <li className={text}>
              <b>「怪しい」</b>: 合格した提出に {d.disputeHours} 時間、押せます。押されたら証拠を送り直す。
            </li>
            <li className={text}>
              <b>理由の審査</b>: 「急な予定」などの理由は、ほかの全員が納得するかを決めます。
            </li>
          </ul>
          <p className={cn(text, "text-sub")}>
            宣言・写真・判定・理由はメンバー全員に見えます。写真に顔や名前、住所などを写さないでください。
          </p>
        </>
      ),
    },
    {
      title: "お金と休み",
      body: (
        <>
          <ul className="m-0 grid list-none gap-1.5 rounded-[10px] border-[2.5px] border-dashed border-ink bg-card p-3">
            {[
              [`${d.declarationCutoff} までに宣言しなかった`, d.noDeclarationYen],
              ["できなかった理由が「サボった」", d.slackedYen],
              ["理由を申告しなかった", d.slackedYen],
            ].map(([label, yen]) => (
              <li key={label} className="flex items-baseline justify-between gap-3 text-sm font-medium">
                <span>{label}</span>
                <b className="shrink-0 font-en text-base">{Number(yen).toLocaleString()} 円</b>
              </li>
            ))}
          </ul>
          <p className={text}>
            毎週{d.settlement}に締めて、決められた相手に PayPay で払います。
            {d.makeup ? `サボりが ${d.makeup.streak} 回続くと、お金に加えて補習が ${d.makeup.sessions} 回付きます。` : ""}
          </p>
          <p className={text}>
            休みたい日は、前の日までに<b>休息日</b>にできます（週 {d.restDaysPerWeek} 日まで）。
          </p>
          <a href="/guide" target="_blank" rel="noopener" className="text-sm font-bold underline underline-offset-2">
            ほかのペナルティと、くわしいルール →
          </a>
        </>
      ),
    },
    {
      title: "あなたの始まり",
      body: (
        <>
          {d.trialEndsAt ? (
            <Sticker tone="tape" shadow="sm" className="grid gap-0.5 px-3.5 py-2.5">
              <b className="text-sm">{d.trialEndsAt} まではお試し期間</b>
              <span className="text-xs font-medium">ペナルティは「本番なら 〇円」と出るだけで、払いません。</span>
            </Sticker>
          ) : (
            <Sticker tone="tape" shadow="sm" className="px-3.5 py-2.5 text-sm font-bold">
              お試し期間はありません。今日から本番です。
            </Sticker>
          )}
          <p className={text}>
            {d.canDeclareToday
              ? `今日の宣言は ${d.declarationCutoff} まで。通知の設定が終わったら、さっそく宣言できます。`
              : `今日の宣言は締め切りました。明日は 0:00 から宣言できます（${d.reminderTime} にまだなら通知が届きます）。`}
          </p>
          {again ? null : (
            <p className={cn(text, "text-sub")}>
              締切や審査のお知らせは、すべてアプリの通知で届きます。次の画面で通知を ON にしてください。
            </p>
          )}
        </>
      ),
    },
  ];
}
