import { describe, expect, it } from "vitest";
import { asUser, createMember, createTestDb, setNow, type Db } from "./harness";

// M8c: weekly reviews (F12). Week = Sunday 10-18 .. Saturday 10-24.

async function setup() {
  const db = await createTestDb();
  await setNow(db, "2026-10-01 09:00");
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  await db.query("update public.profiles set trial_ends_at = '2026-01-01', created_at = '2026-10-18 08:00+09'::timestamptz + (created_at - (select min(created_at) from public.profiles))");
  return { db, aki, ben };
}

const run = async (db: Db, when: string) => {
  await setNow(db, when);
  return (await db.query<{ type: string; actor_id: string; payload: Record<string, unknown> }>("select * from public.create_weekly_reviews()")).rows;
};

describe("create_weekly_reviews", () => {
  it("creates one review per member with the week's numbers, once, after Saturday 23:59", async () => {
    const { db, aki, ben } = await setup();
    await db.query("insert into public.rest_days (user_id, date) values ($1, '2026-10-20')", [aki]);
    await setNow(db, "2026-10-21 12:05");
    await db.query("select * from public.close_declarations()"); // both: no declaration on 10-21

    expect(await run(db, "2026-10-24 23:58")).toEqual([]);
    const events = await run(db, "2026-10-25 00:02");
    expect(events.map((e) => [e.type, e.actor_id]).sort()).toEqual(
      [
        ["weekly_review_created", aki],
        ["weekly_review_created", ben],
      ].sort(),
    );
    const { rows } = await db.query<{ stats: Record<string, unknown> }>(
      "select stats from public.weekly_reviews where user_id = $1 and week_end = '2026-10-24'",
      [aki],
    );
    expect(rows[0].stats).toMatchObject({ completed: 0, counted: 1, rest: 1, penalty: 500, penalty_by_reason: { no_declaration: 500 } });
    expect(await run(db, "2026-10-25 00:07")).toEqual([]);
  });

  it("skips weeks nobody played", async () => {
    const { db } = await setup();
    expect(await run(db, "2026-10-25 00:02")).toEqual([]);
  });
});

describe("summaries and notes", () => {
  it("fills the AI summary once, and lets only the owner write a note", async () => {
    const { db, aki, ben } = await setup();
    await setNow(db, "2026-10-21 12:05");
    await db.query("select * from public.close_declarations()");
    await run(db, "2026-10-25 00:02");

    await db.query("select public.record_weekly_summary($1, '2026-10-24', '要約 1', 'test')", [aki]);
    await db.query("select public.record_weekly_summary($1, '2026-10-24', '要約 2', 'test')", [aki]);
    await db.query("select public.save_weekly_note($1, '2026-10-24', '来週は朝にやる')", [aki]);

    const seen = await asUser(db, ben, async (tx) =>
      (await tx.query("select ai_summary, self_note from public.weekly_reviews where user_id = $1", [aki])).rows,
    );
    expect(seen).toEqual([{ ai_summary: "要約 1", self_note: "来週は朝にやる" }]);
    await expect(db.query("select public.save_weekly_note($1, '2026-10-17', 'x')", [aki])).rejects.toThrow(/not_found/);
    await expect(
      asUser(db, aki, (tx) => tx.query("update public.weekly_reviews set self_note = 'x'")),
    ).rejects.toThrow(/permission denied/);
  });
});
