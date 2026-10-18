"use client";

import { useActionState } from "react";
import { declareGoal, type FormState } from "@/actions/declarations";
import { Countdown } from "@/components/brand/countdown";
import { Sticker } from "@/components/brand/sticker";
import { FieldLabel, TextArea } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";
import { formatJstDateTime, formatJstTime } from "@/lib/time";

type Props = {
  /** Today's declaration cutoff (ISO). */
  cutoff: string;
  /** When today's submissions close: tomorrow's cutoff (ISO, ADR-032). */
  submitBy: string;
  /** "Next plan" from the last unrealistic report, shown as a reminder (F3). */
  nextPlan: string | null;
};

export function DeclareForm({ cutoff, submitBy, nextPlan }: Props) {
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

      <div data-tip="declare_input" className="grid gap-1.5">
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

      <p className="m-0 rounded-[10px] border-2 border-dashed border-ink px-3 py-2 text-sm leading-relaxed font-medium">
        提出は <b>{formatJstDateTime(submitBy)}</b> まで（明日の宣言をする前）。夜中でも出せます。合格するか「できなかった」を押すまで、明日の宣言はできません。
      </p>

      <FieldError id="declare-error" message={errors.form} />
      <SubmitButton tone="mint" pendingLabel="宣言中…" hint="宣言すると今日の合言葉が出ます">
        宣言する
      </SubmitButton>
    </form>
  );
}
