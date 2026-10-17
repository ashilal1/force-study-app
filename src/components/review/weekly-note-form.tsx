"use client";

import { useActionState } from "react";
import { saveWeeklyNote } from "@/actions/weekly";
import type { FormState } from "@/actions/declarations";
import { TextArea } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";

export function WeeklyNoteForm({ weekEnd, note }: { weekEnd: string; note: string | null }) {
  const [state, formAction] = useActionState<FormState, FormData>(saveWeeklyNote, {});
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="weekEnd" value={weekEnd} />
      <TextArea
        name="note"
        aria-label="振り返りメモ"
        maxLength={4000}
        defaultValue={state.values?.note ?? note ?? ""}
        placeholder="今週うまくいったこと、来週変えること"
      />
      <FieldError id="note-error" message={state.errors?.form} />
      {state.done ? (
        <p role="status" className="m-0 text-sm font-bold text-mint-ink">
          保存しました
        </p>
      ) : null}
      <SubmitButton tone="mint" pendingLabel="保存中…" className="py-2 text-base">
        メモを保存する
      </SubmitButton>
    </form>
  );
}
