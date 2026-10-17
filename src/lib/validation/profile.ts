import { z } from "zod";

// Mirrors the checks on public.profiles (display_name 1-30 chars after trim, paypay_link https://).
// The database enforces them too; these give friendly messages before the round trip.

export const displayNameSchema = z
  .string()
  .trim()
  .refine((value) => [...value].length >= 1, "表示名を入力してください")
  .refine((value) => [...value].length <= 30, "表示名は 30 文字以内にしてください");

export const paypayLinkSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .pipe(
    z
      .url({ protocol: /^https$/, error: "https:// で始まる PayPay の受け取りリンクを入れてください" })
      .nullable(),
  );

/** "google" uses the photo from the Google account; "initial" shows the first letter instead. */
export const avatarChoiceSchema = z.enum(["google", "initial"]);

export const joinSchema = z.object({
  code: z.string().trim().min(1, "招待コードを入力してください"),
  displayName: displayNameSchema,
  avatar: avatarChoiceSchema,
});

export const profileSchema = z.object({
  displayName: displayNameSchema,
  avatar: avatarChoiceSchema,
  paypayLink: paypayLinkSchema,
});

/** Turns zod issues into { field: first message } for the form. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}
