"use client";

import { useActionState } from "react";
import { flagDeclaration, type FormState } from "@/actions/declarations";
import { flagSubmission } from "@/actions/disputes";
import { TextArea } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";

const TEXT = {
  declaration: {
    toggle: "軽すぎる？",
    placeholder: "どこが軽いか、どうすればいいかを書く（本人に届きます）",
    submit: "軽すぎると指摘する",
    done: (owner: string) => `指摘しました。${owner} さんに書き直しを求めています。`,
  },
  submission: {
    toggle: "怪しい？",
    placeholder: "どこが怪しいかを書く（本人とほかの全員に届きます）",
    submit: "怪しいと指摘する",
    done: (owner: string) => `指摘しました。${owner} さんは 1 時間以内なら証拠を送り直せます。`,
  },
} as const;

/** 「軽すぎる」 (F3b) or 「怪しい」 (F5b), each with a required reason, behind a toggle. */
export function FlagForm({
  logId,
  ownerName,
  target = "declaration",
}: {
  logId: string;
  ownerName: string;
  target?: keyof typeof TEXT;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    target === "declaration" ? flagDeclaration : flagSubmission,
    {},
  );
  const text = TEXT[target];
  if (state.done) return <p className="m-0 text-sm font-bold text-red">{text.done(ownerName)}</p>;

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm font-bold text-red underline underline-offset-2 [&::-webkit-details-marker]:hidden">
        {text.toggle}
      </summary>
      <form action={formAction} className="mt-2 grid gap-2">
        <input type="hidden" name="logId" value={logId} />
        <TextArea
          name="comment"
          required
          maxLength={300}
          aria-label="理由"
          placeholder={text.placeholder}
          defaultValue={state.values?.comment ?? ""}
          className="min-h-16 text-sm"
        />
        <FieldError id={`flag-${target}-${logId}`} message={state.errors?.comment ?? state.errors?.form} />
        <SubmitButton tone="red" pendingLabel="送信中…" className="py-2 text-base">
          {text.submit}
        </SubmitButton>
      </form>
    </details>
  );
}
