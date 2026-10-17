"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "@/actions/profile";
import { FieldLabel, TextInput } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";
import { AvatarChoice } from "./avatar-choice";

type Props = {
  displayName: string;
  paypayLink: string | null;
  usesGooglePhoto: boolean;
  googleAvatarUrl: string | null;
};

export function ProfileForm({ displayName, paypayLink, usesGooglePhoto, googleAvatarUrl }: Props) {
  const [state, formAction] = useActionState<ProfileState, FormData>(updateProfile, {});
  const errors = state.errors ?? {};
  const values = state.values ?? {
    displayName,
    avatar: usesGooglePhoto ? "google" : "initial",
    paypayLink: paypayLink ?? "",
  };

  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="displayName">表示名</FieldLabel>
        <TextInput
          id="displayName"
          name="displayName"
          required
          maxLength={30}
          defaultValue={values.displayName}
          autoComplete="nickname"
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby="displayName-error"
        />
        <FieldError id="displayName-error" message={errors.displayName} />
      </div>

      <AvatarChoice
        name={values.displayName}
        googleAvatarUrl={googleAvatarUrl}
        defaultChoice={values.avatar === "google" ? "google" : "initial"}
      />

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="paypayLink">PayPay の受け取りリンク</FieldLabel>
        <TextInput
          id="paypayLink"
          name="paypayLink"
          type="url"
          inputMode="url"
          defaultValue={values.paypayLink}
          placeholder="https://qr.paypay.ne.jp/..."
          aria-invalid={Boolean(errors.paypayLink)}
          aria-describedby="paypayLink-hint paypayLink-error"
        />
        <p id="paypayLink-hint" className="m-0 text-xs text-sub">
          PayPay アプリの「受け取る」→「リンクをコピー」。精算でほかのメンバーがここに払います。
        </p>
        <FieldError id="paypayLink-error" message={errors.paypayLink} />
      </div>

      <FieldError id="form-error" message={errors.form} />
      {state.saved && !state.errors ? (
        <p role="status" className="m-0 text-sm font-bold text-mint-ink">
          保存しました
        </p>
      ) : null}
      <SubmitButton pendingLabel="保存中…">保存する</SubmitButton>
    </form>
  );
}
