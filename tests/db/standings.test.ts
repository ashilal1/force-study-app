import { describe, expect, it } from "vitest";
import { createMember, createTestDb, setNow } from "./harness";

// ADR-041: record_standings keeps a snapshot per group and records one event per change.

type Event = { id: string; type: string; actor_id: string | null; group_id: string; payload: Record<string, unknown> };

describe("record_standings", () => {
  it("records a snapshot and the changes, only against the latest snapshot", async () => {
    const db = await createTestDb();
    await setNow(db, "2026-10-20 09:00");
    const aki = await createMember(db, "aki");
    const ben = await createMember(db, "ben");
    const { rows: [{ group_id: group }] } = await db.query<{ group_id: string }>("select group_id from public.profiles where id = $1", [aki]);
    const record = (previous: string | null, snapshot: object, changes: object[]) =>
      db.query<Event>("select * from public.record_standings($1, $2, $3, $4)", [group, previous, JSON.stringify(snapshot), JSON.stringify(changes)]);
    const latest = async () =>
      (await db.query<{ id: string }>("select id from public.activity_events where type = 'standing_snapshot' order by created_at desc, id desc limit 1")).rows[0]?.id ?? null;

    expect((await record(null, { members: {}, crown: [] }, [])).rows).toEqual([]);
    const first = await latest();
    expect(first).not.toBeNull();

    // A tick that read no snapshot (stale) records nothing.
    expect((await record(null, { members: {}, crown: [] }, [{ type: "crown_moved", actor_id: aki, payload: {} }])).rows).toEqual([]);

    // The next tick, a little later (snapshots are told apart by time).
    await setNow(db, "2026-10-20 09:05");
    const { rows } = await record(first, { members: {}, crown: [aki] }, [
      { type: "title_awarded", actor_id: ben, payload: { title: "saborer" } },
      { type: "crown_moved", actor_id: aki, payload: { from: [] } },
      { type: "settlement_created", actor_id: aki, payload: {} }, // not a standing change: ignored
    ]);
    expect(rows.map((row) => [row.type, row.actor_id, row.group_id]).sort()).toEqual(
      [
        ["crown_moved", aki, group],
        ["title_awarded", ben, group],
      ].sort(),
    );
    expect(await latest()).not.toBe(first);
  });
});
