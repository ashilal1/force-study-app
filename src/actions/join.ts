"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { inviteEnv } from "@/lib/env.server";
import { secureEqual } from "@/lib/secure-compare";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors, joinSchema } from "@/lib/validation/profile";

export type JoinState = {
  errors?: Record<string, string>;
  /** Echoed back so the form keeps what was typed (React resets the form after an action). */
  values?: { displayName: string; avatar: string };
};

/** Checks the invite code, then creates the caller's profile with join_group (ADR-025). */
export async function joinGroup(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const user = await requireUser();

  const input = {
    code: String(formData.get("code") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    avatar: String(formData.get("avatar") ?? "initial"),
  };
  const values = { displayName: input.displayName, avatar: input.avatar };

  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { code, displayName, avatar } = parsed.data;
  if (!secureEqual(code, inviteEnv().INVITE_CODE)) {
    return { errors: { code: "招待コードが違います" }, values };
  }

  // The photo URL comes from the verified session, never from the form.
  const avatarUrl = avatar === "google" ? user.googleAvatarUrl : null;
  const { data: profile, error } = await createAdminClient().rpc("join_group", {
    p_user_id: user.id,
    p_display_name: displayName,
    // Generated types mark every argument non-null; the column (and the function) accept null.
    p_avatar_url: avatarUrl as string,
  });
  if (error) {
    console.error("join_group failed", error);
    return { errors: { form: "参加できませんでした。時間をおいてもう一度試してください" }, values };
  }
  if (profile.deactivated_at) {
    return { errors: { form: "このアカウントは利用停止中です。グループの管理者に連絡してください" }, values };
  }

  redirect("/");
}
