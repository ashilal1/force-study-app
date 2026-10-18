"use client";

import { useActionState, useState } from "react";
import { fileReport } from "@/actions/reports";
import type { FormState } from "@/actions/declarations";
import { ActionButton } from "@/components/brand/action-button";
import { Countdown } from "@/components/brand/countdown";
import { Stamp } from "@/components/brand/stamp";
import { Sticker } from "@/components/brand/sticker";
import { CharCount, FieldLabel, TextArea } from "@/components/form/fields";
import { FieldError } from "@/components/form/submit-button";
import { formatJstDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Category = "unrealistic" | "sudden_plan" | "other" | "slacked";

export type ReasonAmounts = {
  slacked: number;
  unrealisticStreak: number;
  excuseRejected: number;
  /** P3 starts on this many unrealistic misses in a row. */
  streakThreshold: number;
};

const DEFAULT_AMOUNTS: ReasonAmounts = { slacked: 700, unrealisticStreak: 500, excuseRejected: 500, streakThreshold: 4 };

type Props = {
  deadline: string;
  goal: string;
  minChars: number;
  /** Unrealistic misses in a row before this day (this one would be +1). */
  unrealisticStreak: number;
  amounts?: ReasonAmounts;
  /** Today's missed log; omitted in the /preview gallery, where the form doesn't submit. */
  logId?: string;
};

const yen = (value: number) => `${value.toLocaleString()}円`;

export function ReasonForm({ deadline, goal, minChars, unrealisticStreak, amounts = DEFAULT_AMOUNTS, logId }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(fileReport, {});
  const [category, setCategory] = useState<Category | null>((state.values?.category as Category) ?? null);
  const [text, setText] = useState(state.values?.text ?? "");

  const nextStreak = unrealisticStreak + 1;
  const options: { value: Category; title: string; amount: string; note: string; prompt?: string }[] = [
    {
      value: "unrealistic",
      title: "宣言が妥当じゃなかった",
      amount: nextStreak >= amounts.streakThreshold ? yen(amounts.unrealisticStreak) : "0円",
      note:
        unrealisticStreak > 0
          ? `今回で ${nextStreak} 回連続 ・ ${amounts.streakThreshold} 回目から ${yen(amounts.unrealisticStreak)}`
          : `次の計画を書く ・ ${amounts.streakThreshold} 回連続から ${yen(amounts.unrealisticStreak)}`,
      prompt: "次どうする？",
    },
    {
      value: "sudden_plan",
      title: "急遽予定ができた",
      amount: "0円?",
      note: `全員が納得したら 0 円、だめなら ${yen(amounts.excuseRejected)}`,
      prompt: "何があった？",
    },
    {
      value: "other",
      title: "その他",
      amount: "0円?",
      note: `全員が納得したら 0 円、だめなら ${yen(amounts.excuseRejected)}`,
      prompt: "理由",
    },
    { value: "slacked", title: "サボった", amount: yen(amounts.slacked), note: `正直に言っても ${yen(amounts.slacked)}` },
  ];

  const selected = options.find((option) => option.value === category);
  const needsText = Boolean(selected?.prompt);
  const ready = category !== null && (!needsText || [...text.trim()].length >= minChars) && !pending;

  return (
    <form action={logId ? formAction : undefined} onSubmit={logId ? undefined : (event) => event.preventDefault()} className="grid gap-5">
      {logId ? <input type="hidden" name="logId" value={logId} /> : null}
      <div className="grid justify-items-center gap-3 pt-2 text-center">
        <Stamp tone="red" label="未達成" className="px-5 py-1.5 text-[2.2rem]" />
        <p className="m-0 text-sm leading-relaxed font-medium">
          締切までに合格できませんでした（{goal}）。
          <br />
          今日のうちに理由を書いて、振り返りましょう。申告したら変えられません。
        </p>
      </div>

      <Sticker tone="tape" className="flex items-center justify-between px-3.5 py-3">
        <div>
          <small className="block text-xs">理由申告の締切</small>
          <span className="font-en text-xl">{formatJstDateTime(deadline)}</span>
        </div>
        <div className="text-right">
          <small className="block text-xs">残り</small>
          <span className="font-en text-2xl">
            <Countdown until={deadline} />
          </span>
        </div>
      </Sticker>

      <fieldset data-tip="report" className="m-0 grid gap-3 border-0 p-0">
        <legend className="sr-only">理由</legend>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-0.5 rounded-[14px] border-[3px] border-ink px-3.5 py-3 shadow-hard has-focus-visible:outline-[3px] has-focus-visible:outline-offset-2",
              category === option.value ? "bg-mint" : "bg-card",
            )}
          >
            <input
              type="radio"
              name="category"
              value={option.value}
              checked={category === option.value}
              onChange={() => setCategory(option.value)}
              className="sr-only"
            />
            <b className="text-base">{option.title}</b>
            <em className={cn("text-right font-en text-lg not-italic", option.value === "slacked" && "text-red")}>
              {option.amount}
            </em>
            <span className="col-span-2 text-xs font-medium text-sub">{option.note}</span>
          </label>
        ))}
      </fieldset>

      {category ? (
        <div className="grid gap-1.5">
          <FieldLabel htmlFor="reason-text">{selected?.prompt ?? "ひとこと（任意）"}</FieldLabel>
          <TextArea
            id="reason-text"
            name="text"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              category === "unrealistic"
                ? "例: 3 章を 2 日に分ける。明日は重解のケースだけに絞って、例題を先に解く"
                : category === "slacked"
                  ? "例: 動画を見始めて止まらなかった"
                  : "具体的に。ほかのメンバーが読んで納得できるように"
            }
          />
          {needsText ? <CharCount value={text} min={minChars} /> : null}
        </div>
      ) : null}

      <FieldError id="report-error" message={state.errors?.form} />
      <ActionButton type="submit" disabled={!ready} tone={category === "slacked" ? "red" : "mint"}>
        {pending ? "申告中…" : "申告する"}
      </ActionButton>
    </form>
  );
}
