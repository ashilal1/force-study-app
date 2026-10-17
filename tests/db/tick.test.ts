import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAuthUser, createMember, createTestDb, setNow, type Db } from "./harness";

// M6: the scheduled steps. Times are JST on Tuesday 2026-10-20 unless stated.

type Event = { type: string; actor_id: string; study_log_id: string | null; payload: Record<string, unknown> };

const types = (rows: Event[]) => rows.map((e) => e.type).sort();
const run = async (db: Db, fn: string) => (await db.query<Event>(`select * from public.${fn}()`)).rows;

async function setup() {
  const db = await createTestDb();
  await setNow(db, "2026-10-19 09:00");
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  const cho = await createMember(db, "cho");
  await db.query("update public.profiles set trial_ends_at = '2026-01-01', created_at = '2026-10-01'");
  return { db, aki, ben, cho };
}

async function declare(db: Db, userId: string, end = "15:00") {
  const { rows } = await db.query<{ study_log_id: string }>(
    "select study_log_id from public.declare_goal($1, '演習', $2::time, 'さくら 47')",
    [userId, end],
  );
  return rows[0].study_log_id;
}

describe("declaration reminders and P1", () => {
  it("reminds undeclared members at 0:00 and 11:00, once each", async () => {
    const { db, aki, ben, cho } = await setup();
    await db.query("insert into public.rest_days (user_id, date) values ($1, '2026-10-20')", [cho]);
    await setNow(db, "2026-10-20 00:03");
    const midnight = await run(db, "run_declaration_reminders");
    expect(midnight.map((e) => [e.type, e.actor_id]).sort()).toEqual(
      [
        ["reminder_declare_midnight", aki],
        ["reminder_declare_midnight", ben],
      ].sort(),
    );
    expect(await run(db, "run_declaration_reminders")).toHaveLength(0);

    await setNow(db, "2026-10-20 09:00");
    await declare(db, aki);
    await setNow(db, "2026-10-20 11:02");
    const last = await run(db, "run_declaration_reminders");
    expect(last.map((e) => [e.type, e.actor_id])).toEqual([["reminder_declare_last_call", ben]]);
    await setNow(db, "2026-10-20 12:00");
    expect(await run(db, "run_declaration_reminders")).toHaveLength(0);
  });

  it("closes the day at 12:00 with P1 for whoever didn't declare, once", async () => {
    const { db, aki, ben, cho } = await setup();
    await db.query("insert into public.rest_days (user_id, date) values ($1, '2026-10-20')", [cho]);
    await setNow(db, "2026-10-20 09:00");
    await declare(db, aki);
    await setNow(db, "2026-10-20 11:59");
    expect(await run(db, "close_declarations")).toHaveLength(0);

    await setNow(db, "2026-10-20 12:04");
    const closed = await run(db, "close_declarations");
    expect(closed.map((e) => [e.type, e.actor_id, e.payload.points])).toEqual([["no_declaration", ben, 500]]);
    expect(await run(db, "close_declarations")).toHaveLength(0);
    const { rows } = await db.query("select user_id, reason from public.penalties");
    expect(rows).toEqual([{ user_id: ben, reason: "no_declaration" }]);
  });

  it("doesn't charge someone who joined after the cutoff", async () => {
    const { db, aki } = await setup();
    await setNow(db, "2026-10-20 13:00");
    const late = await createAuthUser(db, "late@example.com");
    const invite = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    await db.query("select public.create_invite($1, $2)", [aki, invite]);
    await db.query("select public.join_group($1, 'late', null, $2)", [late, invite]);
    await db.query("update public.profiles set created_at = '2026-10-20 13:00+09' where id = $1", [late]);
    const closed = await run(db, "close_declarations");
    expect(closed.map((e) => e.actor_id)).not.toContain(late);
  });
});

describe("submission deadlines", () => {
  it("reminds an hour before the deadline, then closes the day as missed with a report due 23:00", async () => {
    const { db, aki } = await setup();
    await setNow(db, "2026-10-20 09:00");
    const logId = await declare(db, aki);
    await setNow(db, "2026-10-20 14:05");
    expect(types(await run(db, "due_submit_reminders"))).toEqual(["reminder_submit"]);
    expect(await run(db, "due_submit_reminders")).toHaveLength(0);

    await setNow(db, "2026-10-20 15:00");
    const missed = await run(db, "close_overdue_logs");
    expect(types(missed)).toEqual(["missed"]);
    expect(new Date(String(missed[0].payload.report_due_at)).toISOString()).toBe("2026-10-20T14:00:00.000Z");
    const { rows } = await db.query("select status from public.failure_reports where study_log_id = $1", [logId]);
    expect(rows).toEqual([{ status: "awaiting_report" }]);
    expect(await run(db, "close_overdue_logs")).toHaveLength(0);
  });

  it("waits up to an hour for a submission still being judged", async () => {
    const { db, aki } = await setup();
    await setNow(db, "2026-10-20 09:00");
    const logId = await declare(db, aki);
    await setNow(db, "2026-10-20 14:59");
    await db.query("select public.create_submission($1, $2, $3, null, 'a', 'b', 3)", [
      aki,
      logId,
      [`${aki}/2026-10-20/${randomUUID()}.webp`],
    ]);
    await setNow(db, "2026-10-20 15:30");
    expect(await run(db, "close_overdue_logs")).toHaveLength(0);
    await setNow(db, "2026-10-20 16:00");
    expect(types(await run(db, "close_overdue_logs"))).toEqual(["missed"]);
  });

  it("confirms a pass when nobody disputed it in time", async () => {
    const { db, aki } = await setup();
    await setNow(db, "2026-10-20 09:00");
    const logId = await declare(db, aki);
    await setNow(db, "2026-10-20 13:00");
    const { rows } = await db.query<{ submission_id: string }>(
      "select submission_id from public.create_submission($1, $2, $3, null, 'a', 'b', 3)",
      [aki, logId, [`${aki}/2026-10-20/${randomUUID()}.webp`]],
    );
    await db.query("select public.record_judgement($1, 80, true, 'ok', 'test')", [rows[0].submission_id]);
    await setNow(db, "2026-10-20 15:59");
    expect(await run(db, "confirm_passed_logs")).toHaveLength(0);
    await setNow(db, "2026-10-20 16:00");
    expect(types(await run(db, "confirm_passed_logs"))).toEqual(["completion_confirmed"]);
    expect((await db.query("select status from public.study_logs where id = $1", [logId])).rows).toEqual([
      { status: "completed" },
    ]);
  });
});

describe("tick", () => {
  it("runs every step and is safe to repeat", async () => {
    const { db } = await setup();
    await setNow(db, "2026-10-20 12:05");
    const first = await run(db, "tick");
    expect(types(first)).toEqual(["no_declaration", "no_declaration", "no_declaration"]);
    expect(await run(db, "tick")).toHaveLength(0);
  });

  it("reminds on the last day of the trial week", async () => {
    const { db, aki } = await setup();
    await db.query("update public.profiles set trial_ends_at = '2026-10-25 00:00+09' where id = $1", [aki]);
    await setNow(db, "2026-10-23 10:00");
    expect(await run(db, "trial_ending_reminders")).toHaveLength(0);
    await setNow(db, "2026-10-24 08:00");
    const events = await run(db, "trial_ending_reminders");
    expect(events.map((e) => [e.type, e.actor_id])).toEqual([["trial_ending", aki]]);
  });
});
