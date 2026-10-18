import { describe, expect, it } from "vitest";
import { asUser, createInvite, createMember, createTestDb, setNow, type Db } from "./harness";

// Leaving, removal and joining again (ADR-035). A profile is one membership; the account behind
// it (auth_user_id) can join or create a group again later, with a new profile.

type Event = { type: string; actor_id: string; payload: Record<string, unknown> };

async function setup() {
  const db = await createTestDb();
  await setNow(db, "2026-10-19 09:00");
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  const cho = await createMember(db, "cho");
  await db.query("update public.profiles set trial_ends_at = '2026-01-01'");
  return { db, aki, ben, cho };
}

const accountOf = async (db: Db, member: string) =>
  (await db.query<{ a: string }>("select auth_user_id as a from public.profiles where id = $1", [member])).rows[0].a;

const leave = (db: Db, member: string) => db.query<Event>("select * from public.leave_group($1)", [member]);

describe("remove_member (admin)", () => {
  it("ends the membership, quietly closes their open day and clears them as a payee", async () => {
    const { db, aki, ben, cho } = await setup();
    await db.query("update public.profiles set payee_id = $2 where id = $1", [aki, cho]);
    await db.query("select public.declare_goal($1, '演習', null, 'さくら 47')", [cho]);

    await expect(db.query("select public.remove_member($1, $2)", [ben, cho])).rejects.toThrow(/not_admin/);
    await expect(db.query("select public.remove_member($1, $1)", [aki])).rejects.toThrow(/remove_self/);
    const events = (await db.query<Event>("select * from public.remove_member($1, $2)", [aki, cho])).rows;
    expect(events.map((e) => e.type).sort()).toEqual(["member_removed", "payee_cleared"]);

    const { rows } = await db.query(
      "select (select left_reason from public.profiles where id = $1) as reason, (select payee_id from public.profiles where id = $2) as payee, (select status from public.study_logs where user_id = $1) as day",
      [cho, aki],
    );
    expect(rows).toEqual([{ reason: "removed", payee: null, day: "missed" }]);

    // Nothing more happens to them: no penalty, no reminders.
    await setNow(db, "2026-10-20 12:05");
    const tick = (await db.query<Event>("select * from public.tick()")).rows;
    expect(tick.some((e) => e.actor_id === cho)).toBe(false);
    expect((await db.query("select * from public.penalties where user_id = $1", [cho])).rows).toHaveLength(0);
  });

  it("lets the remaining reviewers decide a review the removed member still owed", async () => {
    const { db, aki, ben, cho } = await setup();
    const { rows } = await db.query<{ study_log_id: string }>("select study_log_id from public.declare_goal($1, '演習', null, 'さくら 47')", [aki]);
    const logId = rows[0].study_log_id;
    await db.query("select public.give_up_day($1, $2)", [aki, logId]);
    await db.query(
      "select public.file_failure_report($1, $2, 'other', '親が急に入院して病院に付き添っていたので、夜まで勉強できませんでした')",
      [aki, logId],
    );
    await db.query("select public.cast_review($1, 'excuse', $2, 'accept', null)", [ben, logId]);
    const events = (await db.query<Event>("select * from public.remove_member($1, $2)", [aki, cho])).rows;
    expect(events.map((e) => e.type)).toContain("review_approved");
  });
});

describe("leave_group", () => {
  it("waits for open days and money, and keeps an admin while others remain", async () => {
    const { db, aki, ben } = await setup();
    const { rows } = await db.query<{ study_log_id: string }>("select study_log_id from public.declare_goal($1, '演習', null, 'さくら 47')", [ben]);
    await expect(leave(db, ben)).rejects.toThrow(/leave_day_open/);
    await db.query("select public.give_up_day($1, $2)", [ben, rows[0].study_log_id]);
    await expect(leave(db, ben)).rejects.toThrow(/leave_day_open/); // reason not reported yet
    await db.query("select * from public.file_failure_report($1, $2, 'slacked', null)", [ben, rows[0].study_log_id]);
    await expect(leave(db, ben)).rejects.toThrow(/leave_unsettled/); // 700 yen not settled yet

    await expect(leave(db, aki)).rejects.toThrow(/last_admin/);
  });

  it("lets the same account start over in a new group, keeping the old records in the old one", async () => {
    const { db, aki, ben } = await setup();
    const benAccount = await accountOf(db, ben);
    await db.query("select public.register_rest_day($1, '2026-10-21')", [ben]);
    expect((await leave(db, ben)).rows.map((e) => e.type)).toEqual(["member_left"]);

    const fresh = (await db.query<{ id: string; trial_ends_at: string }>(
      "select id, trial_ends_at from public.create_group($1, 'ben', null, 'ベンの会')",
      [benAccount],
    )).rows[0];
    expect(fresh.id).not.toBe(ben);
    // No second trial week for the same account.
    expect(new Date(fresh.trial_ends_at).getTime()).toBeLessThanOrEqual(new Date("2026-10-19T00:00:00Z").getTime());

    const oldGroupSees = await asUser(db, aki, async (tx) =>
      (await tx.query("select count(*)::int as n from public.rest_days")).rows[0],
    );
    const newGroupSees = await asUser(db, fresh.id, async (tx) =>
      (await tx.query("select count(*)::int as n from public.rest_days")).rows[0],
    );
    expect([oldGroupSees, newGroupSees]).toEqual([{ n: 1 }, { n: 0 }]);
  });

  it("lets the same account join the same group again with an invite", async () => {
    const { db, aki, ben } = await setup();
    const benAccount = await accountOf(db, ben);
    await leave(db, ben);
    const hash = await createInvite(db, aki);
    const again = (await db.query<{ id: string }>("select id from public.join_group($1, 'ben', null, $2)", [benAccount, hash])).rows[0];
    expect(again.id).not.toBe(ben);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.profiles where auth_user_id = $1 and deactivated_at is null",
      [benAccount],
    );
    expect(rows).toEqual([{ n: 1 }]);
  });
});
