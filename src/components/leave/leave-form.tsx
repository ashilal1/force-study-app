"use client";

import { useActionState, useState } from "react";
import { requestLeave } from "@/actions/leave";
import type { FormState } from "@/actions/declarations";
import { CharCount, FieldLabel, TextArea, TextInput } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";

/** F2b: period (from tomorrow) and a reason everyone else will read before approving. */
export function LeaveForm({ minDate, minChars }: { minDate: string; minChars: number }) {
  const [state, formAction] = useActionState<FormState, FormData>(requestLeave, {});
  const [reason, setReason] = useState(state.values?.reason ?? "");
  const errors = state.errors ?? {};

  if (state.done) {
    return <p className="m-0 text-sm font-bold">申請しました。ほかの全員が今日 23:59 までに承認すれば休会になります。</p>;
  }

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <FieldLabel htmlFor="start">開始日</FieldLabel>
          <TextInput id="start" name="start" type="date" required min={minDate} defaultValue={state.values?.start ?? ""} />
          <FieldError id="start-error" message={errors.start} />
        </div>
        <div className="grid gap-1.5">
          <FieldLabel htmlFor="end">終了日</FieldLabel>
          <TextInput id="end" name="end" type="date" required min={minDate} defaultValue={state.values?.end ?? ""} />
          <FieldError id="end-error" message={errors.end} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="reason">理由</FieldLabel>
        <TextArea
          id="reason"
          name="reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="例: 10/22〜10/28 は期末テストが続くので、その期間はテスト勉強に集中したい"
        />
        <CharCount value={reason} min={minChars} />
        <FieldError id="reason-error" message={errors.reason} />
      </div>
      <p className="m-0 text-xs text-sub">
        ほかの全員が今日 23:59 までに承認したら成立します。1 人でも却下するか、そろわなければ不成立（ペナルティはなし。申請し直せます）。
      </p>
      <FieldError id="leave-error" message={errors.form} />
      <SubmitButton tone="mint" pendingLabel="申請中…" disabled={[...reason.trim()].length < minChars}>
        休会を申請する
      </SubmitButton>
    </form>
  );
}
