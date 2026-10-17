"use client";

import { useActionState } from "react";
import { declareGoal, type FormState } from "@/actions/declarations";
import { Countdown } from "@/components/brand/countdown";
import { Sticker } from "@/components/brand/sticker";
import { FieldLabel, TextArea, TextInput } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";
import { formatJstTime } from "@/lib/time";

type Props = {
  /** Today's declaration cutoff (ISO). */
  cutoff: string;
  /** Latest allowed deadline, "HH:mm". */
  deadlineMax: string;
  /** "Next plan" from the last unrealistic report, shown as a reminder (F3). */
  nextPlan: string | null;
};

export function DeclareForm({ cutoff, deadlineMax, nextPlan }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(declareGoal, {});
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="grid gap-4">
      <Sticker tone="tape" shadow="sm" className="flex items-center justify-between px-3.5 py-2.5">
        <span className="text-sm font-bold">宣言の締切 {formatJstTime(cutoff)}</span>
        <span className="font-en text-xl">
          あと <Countdown until={cutoff} />
        </span>
      </Sticker>

      {nextPlan ? (
        <Sticker shadow="none" className="grid gap-1 border-dashed px-3.5 py-2.5">
          <small className="text-xs text-sub">前回書いた「次の計画」</small>
          <p className="m-0 text-sm font-medium whitespace-pre-wrap">{nextPlan}</p>
        </Sticker>
      ) : null}

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="declaration">今日やること</FieldLabel>
        <TextArea
          id="declaration"
          name="declaration"
          required
          maxLength={500}
          defaultValue={state.values?.declaration ?? ""}
          placeholder="例: 線形代数 3 章の演習を 15 問解いて、間違えた問題をノートにまとめる"
          aria-invalid={Boolean(errors.declaration)}
          aria-describedby="declaration-error"
        />
        <p className="m-0 text-xs text-sub">何をどれだけやるか、あとで成果物で示せる形で。宣言したあとは変えられません。</p>
        <FieldError id="declaration-error" message={errors.declaration} />
      </div>

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="endTime">提出締切</FieldLabel>
        <TextInput
          id="endTime"
          name="endTime"
          type="time"
          required
          step={300}
          max={deadlineMax}
          defaultValue={state.values?.endTime ?? ""}
          className="font-en"
          aria-invalid={Boolean(errors.endTime)}
          aria-describedby="endTime-hint endTime-error"
        />
        <p id="endTime-hint" className="m-0 text-xs text-sub">
          今から 30 分以降、{deadlineMax} まで。この時刻までに AI の判定で合格が必要です。
        </p>
        <FieldError id="endTime-error" message={errors.endTime} />
      </div>

      <FieldError id="declare-error" message={errors.form} />
      <SubmitButton tone="mint" pendingLabel="宣言中…" hint="宣言すると今日の合言葉が出ます">
        宣言する
      </SubmitButton>
    </form>
  );
}
