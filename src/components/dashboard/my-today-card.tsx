import { actionButtonVariants } from "@/components/brand/action-button";
import { Countdown } from "@/components/brand/countdown";
import { Pill } from "@/components/brand/pill";
import { Sticker } from "@/components/brand/sticker";
import { Tape } from "@/components/brand/tape";
import { formatJstTime } from "@/lib/time";
import type { MyToday } from "./types";

function Passphrase({ value }: { value: string }) {
  return (
    <Sticker tone="note" shadow="none" className="relative flex items-end justify-between border-[2.5px] border-dashed px-3 pt-3.5 pb-2.5">
      <Tape className="-top-3 left-3.5" />
      <div>
        <small className="block text-xs text-sub">今日の合言葉（写真に写す）</small>
        <strong className="font-hand text-[1.7rem] leading-tight font-semibold">{value}</strong>
      </div>
      <span className="text-xs">全員に公開</span>
    </Sticker>
  );
}

export function MyTodayCard({ me }: { me: MyToday }) {
  const { status } = me;

  return (
    <Sticker className="grid gap-3 px-3.5 pt-3.5 pb-4">
      {status.kind === "undeclared" ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <Pill variant="outline">あなたの今日</Pill>
            <span className="font-en text-xl">
              {formatJstTime(status.declarationCutoff)} まで <Countdown until={status.declarationCutoff} />
            </span>
          </div>
          <p className="m-0 text-[1.05rem]">まだ宣言していません。12:00 を過ぎると 500 円です。</p>
          <a href="/declare" className={actionButtonVariants({ tone: "tape" })}>
            宣言する
          </a>
        </>
      ) : null}

      {status.kind === "pending" ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <Pill variant="outline">あなたの今日</Pill>
            <span className="font-en text-xl">
              {formatJstTime(status.deadline)} まで <Countdown until={status.deadline} />
            </span>
          </div>
          <p className="m-0 text-[1.05rem] leading-snug">{status.goal}</p>
          {me.passphrase ? <Passphrase value={me.passphrase} /> : null}
          <a href="/submit" className={actionButtonVariants({ tone: "mint" })}>
            <span>提出する</span>
            <span className="font-sans text-xs font-bold">
              写真 1〜3 枚 + 振り返り ・ 残り {me.maxAttempts - me.attemptsUsed} 回
            </span>
          </a>
        </>
      ) : null}

      {status.kind === "passed" || status.kind === "completed" ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <Pill variant="outline">あなたの今日</Pill>
            <span className="font-en text-xl">{status.score} / 100</span>
          </div>
          <p className="m-0 text-[1.05rem] leading-snug">{status.goal}</p>
          <p className="m-0 text-sm">
            {status.kind === "passed"
              ? `${formatJstTime(status.disputeWindowEndsAt)} まで「怪しい」がなければ達成で確定します。`
              : "達成が確定しました。おつかれさま。"}
          </p>
        </>
      ) : null}
    </Sticker>
  );
}
