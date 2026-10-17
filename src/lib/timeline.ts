import "server-only";
import { draftNotifications, type ActivityEvent, type MemberName } from "@/lib/notify/rules";
import { createClient } from "@/lib/supabase/server";

// The group timeline (F10): recent activity_events, worded as an onlooker would be told.
// It reuses the notification rules with an extra member who took part in nothing, so whatever
// "everyone else" hears becomes the timeline line; reminders, votes and private notices
// (sent only to the people involved) drop out by themselves.

const OBSERVER = "__timeline__";

export type TimelineItem = { id: string; at: string; title: string; body: string; href: string };

export async function getTimeline(limit = 30, studyLogId?: string): Promise<TimelineItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("activity_events")
    .select("id, type, actor_id, study_log_id, payload, created_at")
    .not("type", "like", "reminder_%");
  // One day's timeline (/logs/[id]) reads oldest first; the group timeline newest first.
  query = studyLogId
    ? query.eq("study_log_id", studyLogId).order("created_at", { ascending: true })
    : query.order("created_at", { ascending: false });
  const [{ data: events, error }, { data: profiles, error: profilesError }] = await Promise.all([
    query.limit(limit * 2),
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
