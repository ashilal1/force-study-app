"use client";

import { useActionState } from "react";
import { reviseDeclaration, type FormState } from "@/actions/declarations";
import { Countdown } from "@/components/brand/countdown";
import { FieldLabel, TextArea } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";
import { formatJstTime } from "@/lib/time";

/** F3b: rewrite a flagged declaration once, before the deadline. Deadline and passphrase stay. */
export function ReviseForm({ logId, current, dueAt }: { logId: string; current: string; dueAt: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(reviseDeclaration, {});
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="logId" value={logId} />
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel htmlFor="revised">書き直す</FieldLabel>
        <span className="text-sm font-bold text-red">
          {formatJstTime(dueAt)} まで（あと <Countdown until={dueAt} />）
        </span>
      </div>
      <TextArea
        id="revised"
        name="declaration"
        required
        maxLength={500}
        defaultValue={state.values?.declaration ?? current}
        aria-invalid={Boolean(errors.declaration)}
        aria-describedby="revised-error"
      />
      <p className="m-0 text-xs text-sub">書き直さないと宣言なしになり、ペナルティが付きます。書き直せるのは 1 回だけです。</p>
      <FieldError id="revised-error" message={errors.declaration ?? errors.form} />
      <SubmitButton tone="orange" pendingLabel="送信中…">
        書き直す
      </SubmitButton>
    </form>
  );
}
