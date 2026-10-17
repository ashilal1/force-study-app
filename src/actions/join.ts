"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { bootstrapEnv } from "@/lib/env.server";
import { dispatch } from "@/lib/notify";
import { hashInviteCode } from "@/lib/invite";
import { secureEqual } from "@/lib/secure-compare";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors, joinSchema } from "@/lib/validation/profile";

export type JoinState = {
  errors?: Record<string, string>;
  /** Echoed back so the form keeps what was typed (React resets the form after an action). */
  values?: { code: string; displayName: string; avatar: string };
};

// Raised by join_group; anything else is unexpected.
const JOIN_ERRORS: Record<string, { field: string; message: string }> = {
  invalid_invite: {
    field: "code",
    message: "このコードは使えません。期限切れか使用済みかもしれないので、新しい招待をもらってください",
  },
  bootstrap_closed: { field: "code", message: "このコードは使えません。メンバーに招待を発行してもらってください" },
  group_full: { field: "form", message: "グループが満員のため参加できません" },
};

/**
 * Joins with a single-use invite (ADR-026). The very first member uses INVITE_CODE instead, which
 * join_group accepts only while the group is still empty.
 */
export async function joinGroup(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const user = await requireUser();

  const values = {
    code: String(formData.get("code") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    avatar: String(formData.get("avatar") ?? "initial"),
  };

  const parsed = joinSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { code, displayName, avatar } = parsed.data;
  const { INVITE_CODE } = bootstrapEnv();
  const bootstrap = INVITE_CODE !== undefined && secureEqual(code, INVITE_CODE);

  // The photo URL comes from the verified session, never from the form.
  const avatarUrl = avatar === "google" ? user.googleAvatarUrl : null;
  const { data: profile, error } = await createAdminClient().rpc("join_group", {
    p_user_id: user.id,
    p_display_name: displayName,
    // Generated types mark every argument non-null; the function accepts null for both.
    p_avatar_url: avatarUrl as string,
    p_invite_hash: (bootstrap ? null : hashInviteCode(code)) as string,
    p_bootstrap: bootstrap,
  });
  if (error) {
    const known = JOIN_ERRORS[error.message];
    if (known) return { errors: { [known.field]: known.message }, values };
    console.error("join_group failed", error);
    return { errors: { form: "参加できませんでした。時間をおいてもう一度試してください" }, values };
  }
  if (profile.deactivated_at) {
    return { errors: { form: "このアカウントは利用停止中です。グループの管理者に連絡してください" }, values };
  }

  // Tell the others (member_joined, recorded by join_group) once the response is on its way.
  after(async () => {
    const { data: event } = await createAdminClient()
      .from("activity_events")
      .select("id")
      .eq("type", "member_joined")
      .eq("actor_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (event) await dispatch(event.id);
  });

  redirect("/");
}
