import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { diffStandings, sameSnapshot, snapshotOf, type Snapshot } from "./changes";
import { loadStandings } from "./load";

/**
 * After each tick: every group's titles, ranks and crown against its last snapshot, recording a
 * new snapshot and one event per change (ADR-041). Returns the change events to dispatch.
 */
export async function recordStandingChanges(): Promise<{ id: string }[]> {
  const admin = createAdminClient();
  const { data: groups, error } = await admin.from("groups").select("id");
  if (error) throw error;

  const events: { id: string }[] = [];
  for (const group of groups) {
    try {
      const { data: latest, error: latestError } = await admin
        .from("activity_events")
        .select("id, payload")
        .eq("group_id", group.id)
        .eq("type", "standing_snapshot")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      const previous = (latest?.payload ?? null) as Snapshot | null;
      const current = snapshotOf(await loadStandings(admin, group.id));
      if (sameSnapshot(previous, current)) continue;

      const { data, error: recordError } = await admin.rpc("record_standings", {
        p_group_id: group.id,
        p_previous_id: latest?.id ?? (null as unknown as string),
        p_snapshot: current as unknown as Json,
        p_changes: diffStandings(previous, current) as unknown as Json,
      });
      if (recordError) throw recordError;
      events.push(...data);
    } catch (groupError) {
      // One group's failure shouldn't stop the others; the next tick tries again.
      console.error("recording standings failed", group.id, groupError);
    }
  }
  return events;
}
