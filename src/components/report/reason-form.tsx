"use client";

import { useState } from "react";
import { ActionButton } from "@/components/brand/action-button";
import { Countdown } from "@/components/brand/countdown";
import { Stamp } from "@/components/brand/stamp";
import { Sticker } from "@/components/brand/sticker";
import { CharCount, FieldLabel, TextArea } from "@/components/form/fields";
import { formatJstTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Category = "unrealistic" | "sudden_plan" | "other" | "slacked";

const OPTIONS: { value: Category; title: string; amount: string; note: string; prompt?: string }[] = [
  { value: "unrealistic", title: "宣言が妥当じゃなかった", amount: "0円", note: "次の計画を書く ・ 4 回連続から 500 円", prompt: "次どうする？" },
  { value: "sudden_plan", title: "急遽予定ができた", amount: "0円?", note: "全員が納得したら 0 円、だめなら 500 円", prompt: "何があった？" },
  { value: "other", title: "その他", amount: "0円?", note: "全員が納得したら 0 円、だめなら 500 円", prompt: "理由" },
  { value: "slacked", title: "サボった", amount: "700円", note: "正直に言っても 700 円" },
];

type Props = {
  deadline: string;
  missedAt: string;
  goal: string;
  minChars: number;
  unrealisticStreak: number;
};

export function ReasonForm({ deadline, missedAt, goal, minChars, unrealisticStreak }: Props) {
  const [category, setCategory] = useState<Category | null>(null);
  const [text, setText] = useState("");
  const selected = OPTIONS.find((o) => o.value === category);
  const needsText = Boolean(selected?.prompt);
  const ready = category !== null && (!needsText || [...text.trim()].length >= minChars);

  return (
    <form className="grid gap-5" onSubmit={(event) => event.preventDefault()}>
      <div className="grid justify-items-center gap-3 pt-2 text-center">
        <Stamp tone="red" label="未達成" className="px-5 py-1.5 text-[2.2rem]" />
        <p className="m-0 text-sm leading-relaxed font-medium">
          {formatJstTime(missedAt)} の締切までに合格できませんでした（{goal}）。
          <br />
          今日のうちに理由を書いて、振り返りましょう。
        </p>
      </div>

      <Sticker tone="tape" className="flex items-center justify-between px-3.5 py-3">
        <div>
          <small className="block text-xs">理由申告の締切</small>
          <span className="font-en text-2xl">今日 {formatJstTime(deadline)}</span>
        </div>
        <div className="text-right">
          <small className="block text-xs">残り</small>
          <span className="font-en text-2xl">
            <Countdown until={deadline} />
          </span>
        </div>
      </Sticker>

      <fieldset className="m-0 grid gap-3 border-0 p-0">
        <legend className="sr-only">理由</legend>
        {OPTIONS.map((option) => (
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
            <span className="col-span-2 text-xs font-medium text-sub">
              {option.value === "unrealistic" && unrealisticStreak > 0
                ? `いま ${unrealisticStreak} 回連続 ・ 4 回目から 500 円`
                : option.note}
            </span>
          </label>
        ))}
      </fieldset>

      {selected?.prompt ? (
        <div className="grid gap-1.5">
          <FieldLabel htmlFor="reason-text">{selected.prompt}</FieldLabel>
          <TextArea
            id="reason-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              category === "unrealistic"
                ? "例: 3 章を 2 日に分ける。明日は重解のケースだけに絞って、例題を先に解く"
                : "具体的に。ほかのメンバーが読んで納得できるように"
            }
          />
          <CharCount value={text} min={minChars} />
        </div>
      ) : null}

      <ActionButton type="submit" disabled={!ready} tone={category === "slacked" ? "red" : "mint"}>
        申告する
      </ActionButton>
    </form>
  );
}
