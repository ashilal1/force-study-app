import "server-only";
import { draftNotifications, type ActivityEvent, type MemberName } from "@/lib/notify/rules";
import { createClient } from "@/lib/supabase/server";

// The group timeline (F10): recent activity_events, worded as an onlooker would be told.
// It reuses the notification rules with an extra member who took part in nothing, so whatever
// "everyone else" hears becomes the timeline line; reminders, votes and private notices
// (sent only to the people involved) drop out by themselves.

const OBSERVER = "__timeline__";

export type TimelineItem = {
  id: string;
  at: string;
  title: string;
  body: string;
  href: string;
  /** Who the line is about, to put the crown next to their name (F14). */
  actor: MemberName | null;
};

type Options = {
  limit?: number;
  /** Only events older than this (ISO), for paging back through /timeline. */
  before?: string;
  /** One day's events, oldest first (/logs/[id]). */
  studyLogId?: string;
};

/** `next` is the cursor for the page after this one, or null at the end. */
export async function getTimeline({ limit = 30, before, studyLogId }: Options = {}): Promise<{
  items: TimelineItem[];
  next: string | null;
}> {
  const supabase = await createClient();
  let query = supabase
    .from("activity_events")
    .select("id, type, actor_id, study_log_id, payload, created_at, study_logs(is_makeup)")
    .not("type", "like", "reminder_%");
  query = studyLogId
    ? query.eq("study_log_id", studyLogId).order("created_at", { ascending: true })
    : query.order("created_at", { ascending: false });
  if (before) query = query.lt("created_at", before);
  // Some events have no timeline line (private notices), so read ahead.
  const batch = Math.max(limit * 3, 60);
  const [{ data: events, error }, { data: profiles, error: profilesError }] = await Promise.all([
    query.limit(batch),
    supabase.from("profiles").select("id, display_name"),
  ]);
  if (error) throw error;
  if (profilesError) throw profilesError;

  const standing = await standingRestDays(events);
  const members: MemberName[] = [...profiles, { id: OBSERVER, display_name: "" }];
  const items: TimelineItem[] = [];
  let last: string | null = null;
  for (const event of events) {
    last = event.created_at;
    // A rest day shows only while it still stands: cancelled ones (and earlier registrations of
    // a day registered again) would make it look like more than the weekly limit was taken.
    if (event.type === "rest_day_registered" && !standing.has(`${event.actor_id}:${new Date(event.created_at).toISOString()}`)) {
      continue;
    }
    const draft = draftNotifications(
      { ...(event as ActivityEvent), makeup: event.study_logs?.is_makeup ?? false },
      members,
    ).find(
      (candidate) => candidate.recipientId === OBSERVER,
    );
    if (!draft) continue;
    const actor = profiles.find((profile) => profile.id === event.actor_id) ?? null;
    items.push({ id: event.id, at: event.created_at, title: draft.title, body: draft.body, href: draft.url, actor });
    if (items.length === limit) break;
  }
  const more = items.length === limit || events.length === batch;
  return { items, next: more && last ? last : null };
}

/** "actor:created_at" of the registration behind each rest day that still exists. */
async function standingRestDays(events: { type: string; actor_id: string | null; payload: unknown }[]) {
  const registrations = events.filter((event) => event.type === "rest_day_registered" && event.actor_id);
  if (registrations.length === 0) return new Set<string>();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rest_days")
    .select("user_id, created_at")
    .in("user_id", [...new Set(registrations.map((event) => event.actor_id!))]);
  if (error) throw error;
  // The registration event and its rest_days row are written in one transaction (same now()).
  return new Set(data.map((row) => `${row.user_id}:${new Date(row.created_at).toISOString()}`));
}
