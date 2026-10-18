"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTipKey } from "@/lib/tips";

// The intro lecture (F15). Writes go through the server and the RPCs like everything else (ADR-004).

/** 「このルールで始める」: records the agreement, then on to the notification setup (F0). */
export async function acceptRules(): Promise<void> {
  const member = await requireMember();
  const { error } = await createAdminClient().rpc("accept_rules", { p_user_id: member.id });
  if (error) {
    console.error("accept_rules failed", error);
    throw new Error("同意を記録できませんでした。もう一度押してください");
  }
  redirect("/onboarding/notifications");
}

/** 「使い方をもう一度見る」 finished: the coach marks show again too, then back to settings. */
export async function finishIntroAgain(): Promise<void> {
  const member = await requireMember();
  const { error } = await createAdminClient().rpc("reset_tips", { p_user_id: member.id });
  if (error) console.error("reset_tips failed", error);
  redirect("/settings");
}

/** A coach mark was closed (F15). Fire-and-forget from the client; a failure only shows it again. */
export async function markTipSeen(tip: string): Promise<void> {
  if (!isTipKey(tip)) return;
  const member = await requireMember();
  const { error } = await createAdminClient().rpc("mark_tip_seen", { p_user_id: member.id, p_tip: tip });
  if (error) console.error("mark_tip_seen failed", error);
}
