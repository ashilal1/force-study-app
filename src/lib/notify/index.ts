import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush, type PushPayload, type PushResult } from "./push";
import { draftNotifications, type ActivityEvent } from "./rules";

// Notification pipeline (docs/architecture.md §2.6): an activity_events row -> notifications for
// the recipients chosen by rules.ts -> Web Push to each recipient's devices. Callers record the
// event (in an RPC) and hand its id here, usually inside after() so the response isn't delayed.
// Failures are logged, never thrown: the event is already recorded and shows in the app.

export async function dispatch(eventId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: event, error: eventError }, { data: members, error: membersError }] = await Promise.all([
      admin.from("activity_events").select("id, type, actor_id, payload").eq("id", eventId).single(),
      admin.from("profiles").select("id, display_name").is("deactivated_at", null),
    ]);
    if (eventError) throw eventError;
    if (membersError) throw membersError;

    const drafts = draftNotifications(event as ActivityEvent, members);
    if (drafts.length === 0) return;

    const { data: created, error } = await admin.rpc("create_notifications", {
      p_event_id: eventId,
      p_items: drafts.map((draft) => ({
        recipient_id: draft.recipientId,
        title: draft.title,
        body: draft.body,
        url: draft.url,
        requires_action: draft.requiresAction,
      })),
    });
    if (error) throw error;

    await pushToDevices(
      created.map((row) => ({
        id: row.id,
        recipientId: row.recipient_id,
        payload: {
          title: row.title,
          body: row.body,
          url: row.url ?? "/notifications",
          tag: `event:${eventId}`,
          requireInteraction: row.requires_action,
        },
      })),
    );
  } catch (error) {
    console.error("notification dispatch failed", eventId, error);
  }
}

type Outgoing = { id: string; recipientId: string; payload: PushPayload };

async function pushToDevices(outgoing: Outgoing[]) {
  if (outgoing.length === 0) return;
  const admin = createAdminClient();
  const recipientIds = [...new Set(outgoing.map((item) => item.recipientId))];
  const { data: devices, error } = await admin
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", recipientIds);
  if (error) throw error;

  const delivered = new Set<string>();
  await Promise.all(
    outgoing.flatMap((item) =>
      devices
        .filter((device) => device.user_id === item.recipientId)
        .map(async (device) => {
          const result = await sendAndRecord(device, item.payload);
          if (result === "ok") delivered.add(item.id);
        }),
    ),
  );

  if (delivered.size > 0) {
    await admin.rpc("mark_notifications_pushed", { p_ids: [...delivered] });
  }
}

async function sendAndRecord(device: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload) {
  const admin = createAdminClient();
  const result = await sendPush(device, payload);
  if (result === "ok") {
    await admin.rpc("record_push_success", { p_endpoint: device.endpoint });
  } else if (result === "gone") {
    // The browser dropped it; F0 sends that device back to setup the next time it opens the app.
    await admin.rpc("delete_push_subscription", { p_endpoint: device.endpoint });
  }
  return result;
}

/**
 * F0 step 4: a test notification to one device, so the member can check that it pops up with
 * sound. Not an activity event: it concerns only this device and never shows in the timeline.
 */
export async function sendTestPush(userId: string, endpoint: string): Promise<PushResult | "unknown"> {
  const device = await findDevice(userId, endpoint);
  if (!device) return "unknown";

  return sendAndRecord(device, {
    title: "テスト通知",
    body: "これが画面に出て音が鳴ったら、アプリに戻って「表示され、音も鳴った」を押してください",
    url: "/onboarding/notifications",
    tag: "notification-test",
    requireInteraction: true,
  });
}

/** The member's registered device with this endpoint, or null. */
export async function findDevice(userId: string, endpoint: string) {
  const { data, error } = await createAdminClient()
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (error) throw error;
  return data;
}
