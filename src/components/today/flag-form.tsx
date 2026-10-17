"use client";

import { useActionState } from "react";
import { flagDeclaration, type FormState } from "@/actions/declarations";
import { TextArea } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";

/** F3b: 「軽すぎる」 with a required reason. Opens from a toggle so the board stays compact. */
export function FlagForm({ logId, ownerName }: { logId: string; ownerName: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(flagDeclaration, {});
  if (state.done) return <p className="m-0 text-sm font-bold text-red">指摘しました。{ownerName} さんに書き直しを求めています。</p>;

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm font-bold text-red underline underline-offset-2 [&::-webkit-details-marker]:hidden">
        軽すぎる？
      </summary>
      <form action={formAction} className="mt-2 grid gap-2">
        <input type="hidden" name="logId" value={logId} />
        <TextArea
          name="comment"
          required
          maxLength={300}
          aria-label="どこが軽いか"
          placeholder="どこが軽いか、どうすればいいかを書く（本人に届きます）"
          defaultValue={state.values?.comment ?? ""}
          className="min-h-16 text-sm"
        />
        <FieldError id={`flag-${logId}`} message={state.errors?.comment ?? state.errors?.form} />
        <SubmitButton tone="red" pendingLabel="送信中…" className="py-2 text-base">
          軽すぎると指摘する
        </SubmitButton>
      </form>
    </details>
  );
}
