"use client";

import { useActionState } from "react";
import { updateGroupSettings } from "@/actions/group-settings";
import type { FormState } from "@/actions/declarations";
import { TextInput } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";
import { SETTING_FIELDS, type SettingField } from "@/lib/group-settings";

/** F11: admins change the rules. Changing them notifies everyone. */
export function GroupSettingsForm({ current }: { current: Record<string, string | number> }) {
  const [state, formAction] = useActionState<FormState, FormData>(updateGroupSettings, {});
  const sections = [...new Set(SETTING_FIELDS.map((field) => field.section))];
  const value = (field: SettingField) =>
    state.values?.[field.key] ?? (field.type === "time" ? String(current[field.key]).slice(0, 5) : String(current[field.key]));

  return (
    <form action={formAction} className="grid gap-5">
      {sections.map((section) => (
        <fieldset key={section} className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-1 font-sans text-base font-black">{section}</legend>
          {SETTING_FIELDS.filter((field) => field.section === section).map((field) => (
            <label key={field.key} className="grid grid-cols-[1fr_9rem] items-center gap-3 text-sm font-bold">
              <span>{field.label}</span>
              <span className="flex items-center gap-1">
                <TextInput
                  name={field.key}
                  type={field.type}
                  step={field.type === "time" ? 60 : 1}
                  min={field.type === "number" ? 0 : undefined}
                  defaultValue={value(field)}
                  required
                  className="px-2 py-1.5 text-sm"
                />
                {field.unit ? <span className="shrink-0 text-xs whitespace-nowrap">{field.unit}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
      ))}
      <FieldError id="settings-error" message={state.errors?.form} />
      {state.done ? (
        <p role="status" className="m-0 text-sm font-bold text-mint-ink">
          保存しました。全員に通知しました。
        </p>
      ) : null}
      <SubmitButton tone="mint" pendingLabel="保存中…">
        グループ設定を保存する
      </SubmitButton>
    </form>
  );
}
