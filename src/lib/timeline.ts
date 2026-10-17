import "server-only";
import { draftNotifications, type ActivityEvent, type MemberName } from "@/lib/notify/rules";
import { createClient } from "@/lib/supabase/server";

// The group timeline (F10): recent activity_events, worded as an onlooker would be told.
// It reuses the notification rules with an extra member who took part in nothing, so whatever
// "everyone else" hears becomes the timeline line; reminders, votes and private notices
// (sent only to the people involved) drop out by themselves.

const OBSERVER = "__timeline__";

export type TimelineItem = { id: string; at: string; title: string; body: string; href: string };

export async function getTimeline(limit = 30): Promise<TimelineItem[]> {
  const supabase = await createClient();
  const [{ data: events, error }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase
      .from("activity_events")
      .select("id, type, actor_id, study_log_id, payload, created_at")
      .not("type", "like", "reminder_%")
      .order("created_at", { ascending: false })
      .limit(limit * 2),
    supabase.from("profiles").select("id, display_name"),
  ]);
  if (error) throw error;
  if (profilesError) throw profilesError;

  const members: MemberName[] = [...profiles, { id: OBSERVER, display_name: "" }];
  const items: TimelineItem[] = [];
  for (const event of events) {
    const draft = draftNotifications(event as ActivityEvent & { payload: Record<string, unknown> }, members).find(
      (candidate) => candidate.recipientId === OBSERVER,
    );
    if (!draft) continue;
    items.push({ id: event.id, at: event.created_at, title: draft.title, body: draft.body, href: draft.url });
    if (items.length === limit) break;
  }
  return items;
}
