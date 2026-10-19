"use client";

import { useActionState } from "react";
import { declareMakeup } from "@/actions/makeup";
import type { FormState } from "@/actions/declarations";
import { FieldLabel, TextArea } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";

type Props = {
  /** The study day's declaration to redo, when the debt came from one (F8b). */
  suggested: string | null;
  /** Hours from declaring to the submission deadline. */
  hours: number;
};

/** Declare one makeup session (補習): same flow as a study day, due `hours` later. */
export function MakeupDeclareForm({ suggested, hours }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(declareMakeup, {});
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="makeup-declaration">補習でやること</FieldLabel>
        <TextArea
          id="makeup-declaration"
          name="declaration"
          required
          maxLength={500}
          defaultValue={state.values?.declaration ?? suggested ?? ""}
          placeholder="例: サボった日の線形代数 3 章の演習 15 問をやり直す"
          aria-invalid={Boolean(errors.declaration)}
          aria-describedby="makeup-declaration-error"
        />
        <p className="m-0 text-xs text-sub">
          {suggested ? "サボった日の宣言を入れてあります。そのままやり直すのが基本です。" : "内容は自由です。"}
          宣言したあとは変えられません。
        </p>
        <FieldError id="makeup-declaration-error" message={errors.declaration} />
      </div>

      <p className="th-box m-0 rounded-[10px] border-2 border-dashed border-ink px-3 py-2 text-sm leading-relaxed font-medium">
        提出は宣言から <b>{hours} 時間</b>以内。いつもの日と同じく、合言葉を写した写真で AI が判定し、「怪しい」の 24 時間がすぎたら 1
        回返したことになります。補習の宣言は 1 日 1 回までです。
      </p>

      <FieldError id="makeup-declare-error" message={errors.form} />
      <SubmitButton tone="mint" pendingLabel="宣言中…" hint="宣言すると補習用の合言葉が出ます">
        補習を宣言する
      </SubmitButton>
    </form>
  );
}
