"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { sendTestPush } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Notification setup (F0) and the notification list. Device registration goes through RPCs with
// the secret key; marking read uses the member's own session (UPDATE(read_at) on their rows).

const subscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(200) }),
});

export type SetupResult = { ok: true } | { ok: false; message: string };

/** F0 step 3: stores this browser's push subscription (PushSubscription.toJSON()). */
export async function savePushSubscription(subscription: unknown, userAgent: string): Promise<SetupResult> {
  const member = await requireMember();
  const parsed = subscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false, message: "この端末の通知の登録に失敗しました。もう一度試してください" };

  const { error } = await createAdminClient().rpc("save_push_subscription", {
    p_user_id: member.id,
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_user_agent: userAgent.slice(0, 300),
  });
  if (error) {
    console.error("save_push_subscription failed", error);
    return { ok: false, message: "この端末の通知の登録に失敗しました。もう一度試してください" };
  }
  return { ok: true };
}

/** F0 step 4: sends a test notification to this device only. */
export async function sendTestNotification(endpoint: string): Promise<SetupResult> {
  const member = await requireMember();
  const result = await sendTestPush(member.id, endpoint);
  switch (result) {
    case "ok":
      return { ok: true };
    case "gone":
    case "unknown":
      return { ok: false, message: "この端末の登録が見つかりません。最初からやり直してください" };
    default:
      return { ok: false, message: "テスト通知を送れませんでした。少し待ってからもう一度試してください" };
  }
}

/** F0 step 5: the member saw the banner and heard the sound on this device. */
export async function confirmNotifications(endpoint: string): Promise<SetupResult> {
  const member = await requireMember();
  const { error } = await createAdminClient().rpc("confirm_push_subscription", {
    p_user_id: member.id,
    p_endpoint: endpoint,
  });
  if (error) {
    if (error.message !== "unknown_subscription") console.error("confirm_push_subscription failed", error);
    return { ok: false, message: "この端末の登録が見つかりません。最初からやり直してください" };
  }
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<void> {
  const member = await requireMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", member.id)
    .is("read_at", null);
  if (error) console.error("mark notifications read failed", error);
  refresh();
}
