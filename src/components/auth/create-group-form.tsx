"use client";

import { useActionState } from "react";
import { createGroup, type CreateGroupState } from "@/actions/join";
import { FieldLabel, TextInput } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";
import { AvatarChoice } from "@/components/profile/avatar-choice";

type Props = { defaultName: string; googleAvatarUrl: string | null };

/** M10: start a new group; the creator becomes its admin. */
export function CreateGroupForm({ defaultName, googleAvatarUrl }: Props) {
  const [state, formAction] = useActionState<CreateGroupState, FormData>(createGroup, {});
  const errors = state.errors ?? {};
  const name = state.values?.displayName ?? defaultName;

  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="groupName">グループ名</FieldLabel>
        <TextInput
          id="groupName"
          name="groupName"
          required
          maxLength={40}
          defaultValue={state.values?.groupName ?? ""}
          placeholder="例: 朝活チーム"
          aria-invalid={Boolean(errors.groupName)}
          aria-describedby="groupName-error"
        />
        <FieldError id="groupName-error" message={errors.groupName} />
      </div>

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="create-displayName">あなたの表示名</FieldLabel>
        <TextInput
          id="create-displayName"
          name="displayName"
          required
          maxLength={30}
          defaultValue={name}
          autoComplete="nickname"
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby="create-displayName-error"
        />
        <FieldError id="create-displayName-error" message={errors.displayName} />
      </div>

      <AvatarChoice
        name={name}
        googleAvatarUrl={googleAvatarUrl}
        defaultChoice={state.values?.avatar === "initial" ? "initial" : "google"}
      />

      <FieldError id="create-form-error" message={errors.form} />
      <SubmitButton tone="tape" pendingLabel="作成中…">
        グループを作る
      </SubmitButton>
    </form>
  );
}
