"use client";

import { useActionState, useState } from "react";
import { giveUpDay, type FormState } from "@/actions/declarations";
import { ActionButton } from "@/components/brand/action-button";
import { FieldError, SubmitButton } from "@/components/form/submit-button";

/**
 * 「できなかった」 (ADR-032): asks once more, then closes the day as missed and opens the reason
 * report. Two steps instead of a browser confirm dialog.
 */
export function GiveUpButton({ logId }: { logId: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(giveUpDay, {});
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <ActionButton type="button" tone="white" onClick={() => setAsking(true)}>
        できなかった
      </ActionButton>
    );
  }
  return (
    <form action={formAction} className="grid gap-2 rounded-[12px] border-[2.5px] border-red bg-card px-3.5 py-3">
      <input type="hidden" name="logId" value={logId} />
      <p className="m-0 text-sm leading-relaxed font-bold">
        この日は未達成になり、もう提出できません。次の画面で理由を申告すると、今日の宣言ができます。
      </p>
      <FieldError id="give-up-error" message={state.errors?.form} />
      <div className="grid grid-cols-2 gap-2">
        <ActionButton type="button" tone="white" onClick={() => setAsking(false)}>
          やめる
        </ActionButton>
        <SubmitButton tone="red" pendingLabel="記録中…">
          未達成にする
        </SubmitButton>
      </div>
    </form>
  );
}
