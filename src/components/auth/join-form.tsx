"use client";

import { useActionState } from "react";
import { joinGroup, type JoinState } from "@/actions/join";
import { FieldLabel, TextInput } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";
import { AvatarChoice } from "@/components/profile/avatar-choice";

export function JoinForm({ defaultName, googleAvatarUrl }: { defaultName: string; googleAvatarUrl: string | null }) {
  const [state, formAction] = useActionState<JoinState, FormData>(joinGroup, {});
  const errors = state.errors ?? {};
  const name = state.values?.displayName ?? defaultName;

  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="code">招待コード</FieldLabel>
        <TextInput
          id="code"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={Boolean(errors.code)}
          aria-describedby="code-error"
        />
        <FieldError id="code-error" message={errors.code} />
      </div>

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="displayName">表示名</FieldLabel>
        <TextInput
          id="displayName"
          name="displayName"
          required
          maxLength={30}
          defaultValue={name}
          autoComplete="nickname"
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby="displayName-error"
        />
        <FieldError id="displayName-error" message={errors.displayName} />
      </div>

      <AvatarChoice
        name={name}
        googleAvatarUrl={googleAvatarUrl}
        defaultChoice={state.values?.avatar === "initial" ? "initial" : "google"}
      />

      <FieldError id="form-error" message={errors.form} />
      <SubmitButton pendingLabel="確認中…">参加する</SubmitButton>
    </form>
  );
}
