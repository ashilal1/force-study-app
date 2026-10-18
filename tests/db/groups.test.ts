import { describe, expect, it } from "vitest";
import { asUser, createAuthUser, createInvite, createMember, createTestDb, setNow, type Db } from "./harness";

// M10 (ADR-034): several groups, one per person. Group A is made by the harness (aki, ben);
// group B is created by dai, who invites eri.

type Event = { type: string; actor_id: string; group_id: string; payload: Record<string, unknown> };

async function setup() {
  const db = await createTestDb();
  await setNow(db, "2026-10-19 09:00");
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  const dai = await createAuthUser(db, "dai@example.com");
  await db.query("select public.create_group($1, 'dai', null, '夜型の会')", [dai]);
  const eri = await createAuthUser(db, "eri@example.com");
  const hash = await createInvite(db, dai);
  await db.query("select public.join_group($1, 'eri', null, $2)", [eri, hash]);
  await db.query("update public.profiles set trial_ends_at = '2026-01-01'");
  const groupOf = async (id: string) =>
    (await db.query<{ group_id: string }>("select group_id from public.profiles where id = $1", [id])).rows[0].group_id;
  return { db, aki, ben, dai, eri, groupA: await groupOf(aki), groupB: await groupOf(dai) };
}

const declare = async (db: Db, userId: string) =>
  (await db.query<{ study_log_id: string }>("select study_log_id from public.declare_goal($1, '演習', null, 'さくら 47')", [userId]))
    .rows[0].study_log_id;

describe("create_group", () => {
  it("makes the creator the admin of a new group with its own settings", async () => {
    const { db, dai, eri, groupA, groupB } = await setup();
    expect(groupA).not.toBe(groupB);
    const { rows } = await db.query("select id, is_admin from public.profiles where group_id = $1 order by created_at", [groupB]);
    expect(rows).toEqual([
      { id: dai, is_admin: true },
      { id: eri, is_admin: false },
    ]);
    expect((await db.query("select count(*)::int as n from public.group_settings")).rows).toEqual([{ n: 2 }]);
  });

  it("is for people not in a group yet, within the app's limits", async () => {
    const { db, aki } = await setup();
    await expect(db.query("select public.create_group($1, 'aki', null, '二つ目')", [aki])).rejects.toThrow(/already_in_group/);
    const fay = await createAuthUser(db, "fay@example.com");
    await expect(db.query("select public.create_group($1, 'fay', null, '  ')", [fay])).rejects.toThrow(/invalid_group_name/);
    await db.query("update public.app_limits set max_groups = 2");
    await expect(db.query("select public.create_group($1, 'fay', null, '三つ目')", [fay])).rejects.toThrow(/app_full/);
    await db.query("update public.app_limits set max_groups = 10, max_total_members = 4");
    await expect(db.query("select public.create_group($1, 'fay', null, '三つ目')", [fay])).rejects.toThrow(/app_full/);
  });

  it("keeps the bootstrap code for an empty install only", async () => {
    const { db } = await setup();
    const gil = await createAuthUser(db, "gil@example.com");
    await expect(db.query("select public.join_group($1, 'gil', null, null, true)", [gil])).rejects.toThrow(/bootstrap_closed/);
  });
});

describe("isolation between groups", () => {
  it("shows members only their own group", async () => {
    const { db, aki, dai, groupA } = await setup();
    await declare(db, dai);
    const seen = await asUser(db, aki, async (tx) => ({
      profiles: (await tx.query("select count(*)::int as n from public.profiles")).rows[0],
      groups: (await tx.query<{ id: string }>("select id from public.groups")).rows.map((row) => row.id),
      settings: (await tx.query("select count(*)::int as n from public.group_settings")).rows[0],
      logs: (await tx.query("select count(*)::int as n from public.study_logs")).rows[0],
      events: (await tx.query<{ type: string }>("select type from public.activity_events order by created_at")).rows.map((r) => r.type),
      history: (await tx.query("select count(distinct user_id)::int as n from public.daily_history")).rows[0],
    }));
    expect(seen).toEqual({
      profiles: { n: 2 },
      groups: [groupA],
      settings: { n: 1 },
      logs: { n: 0 },
      events: ["group_created", "member_joined"],
      history: { n: 2 },
    });
  });

  it("refuses flags, payees and admin changes across groups", async () => {
    const { db, aki, dai, eri } = await setup();
    const logId = await declare(db, dai);
    await expect(db.query("select public.flag_declaration($1, $2, '軽い')", [aki, logId])).rejects.toThrow(/not_found/);
    await expect(db.query("select public.assign_payee($1, $2, $3)", [aki, eri, aki])).rejects.toThrow(/not_found/);
    await expect(db.query("select public.assign_payee($1, $2, $3)", [dai, eri, aki])).rejects.toThrow(/invalid_payee/);
    await expect(db.query("select public.set_admin($1, $2, true)", [aki, eri])).rejects.toThrow(/not_found/);
  });

  it("asks only the owner's group to review", async () => {
    const { db, aki, ben, dai } = await setup();
    await setNow(db, "2026-10-19 09:00");
    const logId = await declare(db, aki);
    await db.query("select public.give_up_day($1, $2)", [aki, logId]);
    const events = await db.query<Event>(
      "select * from public.file_failure_report($1, $2, 'other', '親が急に入院して病院に付き添っていたので、夜まで勉強できませんでした')",
      [aki, logId],
    );
    expect(events.rows.find((e) => e.type === "review_requested")!.payload.reviewer_ids).toEqual([ben]);
    void dai;
  });
});

describe("per-group settings and schedules", () => {
  it("closes declarations at each group's own cutoff", async () => {
    const { db, aki, dai, groupB } = await setup();
    await db.query("update public.group_settings set declaration_cutoff = '10:00', last_declaration_reminder = '09:00' where group_id = $1", [groupB]);
    await setNow(db, "2026-10-19 10:30");
    const events = (await db.query<Event>("select * from public.close_declarations()")).rows;
    expect(events.map((e) => e.actor_id).sort()).toEqual([dai, (await db.query<{ id: string }>("select id from public.profiles where display_name = 'eri'")).rows[0].id].sort());
    await expect(declare(db, aki)).resolves.toBeDefined();
    await expect(declare(db, dai)).rejects.toThrow(/declaration_closed|already_declared/);
  });

  it("lets an admin change only their own group's settings", async () => {
    const { db, aki, groupA, groupB } = await setup();
    await db.query("select public.update_group_settings($1, '{\"passing_score\": 80}')", [aki]);
    const { rows } = await db.query("select group_id, passing_score from public.group_settings order by passing_score");
    expect(rows).toEqual([
      { group_id: groupB, passing_score: 70 },
      { group_id: groupA, passing_score: 80 },
    ]);
  });

  it("settles each group separately, with its own weekly summary", async () => {
    const { db, aki, ben, dai, eri, groupA, groupB } = await setup();
    await db.query("update public.profiles set payee_id = $2 where id = $1", [aki, ben]);
    await db.query("update public.profiles set payee_id = $2 where id = $1", [dai, eri]);
    await setNow(db, "2026-10-21 12:05");
    await db.query("select * from public.close_declarations()"); // everyone: no declaration (P1)
    await setNow(db, "2026-10-25 00:02");
    const events = (await db.query<Event>("select * from public.run_weekly_settlement()")).rows;
    const summaries = events.filter((e) => e.type === "weekly_summary").map((e) => e.group_id).sort();
    expect(summaries).toEqual([groupA, groupB].sort());
    const { rows } = await db.query<{ debtor_id: string; payee_id: string }>("select debtor_id, payee_id from public.settlements order by debtor_id");
    expect(rows.every((row) => [aki, dai].includes(row.debtor_id))).toBe(true);
    expect(events.filter((e) => e.type === "payee_missing").map((e) => e.actor_id).sort()).toEqual([ben, eri].sort());
  });
});

describe("admins", () => {
  it("can add another admin and step down, but never leave the group without one", async () => {
    const { db, aki, ben } = await setup();
    await expect(db.query("select public.set_admin($1, $1, false)", [aki])).rejects.toThrow(/last_admin/);
    await db.query("select public.set_admin($1, $2, true)", [aki, ben]);
    await db.query("select public.set_admin($1, $1, false)", [aki]);
    await expect(db.query("select public.update_group_settings($1, '{\"passing_score\": 75}')", [aki])).rejects.toThrow(/not_admin/);
    await db.query("select public.rename_group($1, '朝活チーム')", [ben]);
    expect((await db.query("select name from public.groups order by created_at limit 1")).rows).toEqual([{ name: "朝活チーム" }]);
  });
});

describe("notifications", () => {
  it("never reach someone outside the event's group", async () => {
    const { db, aki, ben, dai } = await setup();
    const { rows } = await db.query<{ id: string }>("select id from public.activity_events where actor_id = $1", [ben]);
    const items = JSON.stringify([
      { recipient_id: aki, title: "ok" },
      { recipient_id: dai, title: "leak" },
    ]);
    const created = await db.query<{ recipient_id: string }>("select recipient_id from public.create_notifications($1, $2)", [rows[0].id, items]);
    expect(created.rows.map((row) => row.recipient_id)).toEqual([aki]);
  });
});
