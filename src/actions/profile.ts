"use server";

import { refresh } from "next/cache";
import { getSessionUser, requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, profileSchema } from "@/lib/validation/profile";

export type ProfileState = {
  errors?: Record<string, string>;
  saved?: boolean;
  /** Echoed back so the form keeps what was typed (React resets the form after an action). */
  values?: { displayName: string; avatar: string; paypayLink: string };
};

/**
 * Updates the caller's display fields. This is the one table members may write themselves
 * (column-level GRANT + RLS, docs/database.md §4), so it runs as the user, not the secret key.
 */
export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const member = await requireMember();
  const user = await getSessionUser();

  const values = {
    displayName: String(formData.get("displayName") ?? ""),
    avatar: String(formData.get("avatar") ?? "initial"),
    paypayLink: String(formData.get("paypayLink") ?? ""),
  };

  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { displayName, avatar, paypayLink } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      avatar_url: avatar === "google" ? (user?.googleAvatarUrl ?? null) : null,
      paypay_link: paypayLink,
    })
    .eq("id", member.id);
  if (error) {
    console.error("profile update failed", error);
    return { errors: { form: "保存できませんでした。時間をおいてもう一度試してください" }, values };
  }

  refresh();
  return { saved: true, values };
}
