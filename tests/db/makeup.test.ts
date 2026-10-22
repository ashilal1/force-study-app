import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asUser, createMember, createTestDb, setNow, type Db } from "./harness";

// M11: makeup study (補習, F8b): P9 (three slacking days in a row), sessions, P10 (overdue).
// Weeks run Sunday..Saturday and close Saturday 23:59. Times are JST.

type Event = { type: string; actor_id: string; study_log_id: string | null; payload: Record<string, unknown> };
type Balance = {
  owed: number;
  trial_owed: number;
  completed: number;
  reviewing: number;
  open: number;
  remaining: number;
  overdue: number;
  next_due_at: string | null;
};

const PLAN = "次は 3 章を 2 日に分けて、例題を先に解いてから演習に入る";

async function setup() {
  const db = await createTestDb();
  await setNow(db, "2026-10-01 09:00");
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  const cho = await createMember(db, "cho");
  await db.query("update public.profiles set trial_ends_at = '2026-01-01', created_at = '2026-10-01'::timestamptz + (created_at - (select min(created_at) from public.profiles))");
  await db.query("update public.group_settings set makeup_since = '2026-10-01'");
  return { db, aki, ben, cho };
}

/** Nobody else declares on `date`: P1 at 12:05 for everyone without a day yet. */
async function noDeclaration(db: Db, date: string) {
  await setNow(db, `${date} 12:05`);
  await db.query("select * from public.close_declarations()");
}

async function declare(db: Db, userId: string, date: string): Promise<string> {
  await setNow(db, `${date} 09:00`);
  const { rows } = await db.query<Event>("select * from public.declare_goal($1, '演習', '15:00'::time, 'さくら 47')", [userId]);
  return rows[0].study_log_id!;
}

/** Declares, gives up and reports `category` (slacked: P2, unrealistic: P3). */
async function missDay(db: Db, userId: string, date: string, category: "slacked" | "unrealistic") {
  const logId = await declare(db, userId, date);
  await setNow(db, `${date} 15:05`);
  await db.query("select * from public.give_up_day($1, $2)", [userId, logId]);
  await db.query("select * from public.file_failure_report($1, $2, $3, $4)", [
    userId,
    logId,
    category,
    category === "slacked" ? null : PLAN,
  ]);
  return logId;
}

async function submitAndPass(db: Db, userId: string, logId: string, date: string) {
  const sub = await db.query<{ submission_id: string }>(
    "select submission_id from public.create_submission($1, $2, $3, null, 'a', 'b', 3)",
    [userId, logId, [`${userId}/${date}/${randomUUID()}.webp`]],
  );
  await db.query("select public.record_judgement($1, 90, true, 'ok', 'test')", [sub.rows[0].submission_id]);
}

async function completeDay(db: Db, userId: string, date: string) {
  const logId = await declare(db, userId, date);
  await setNow(db, `${date} 10:00`);
  await submitAndPass(db, userId, logId, date);
  // The 「怪しい」 window is 24 hours; confirm the next morning.
  await setNow(db, nextDay(date, "10:30"));
  await db.query("select * from public.confirm_passed_logs()");
}

function nextDay(date: string, time: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)} ${time}`;
}

const award = async (db: Db, when: string) => {
  await setNow(db, when);
  return (await db.query<Event>("select * from public.award_makeups()")).rows;
};

const debts = async (db: Db, userId: string) =>
  (
    await db.query<{ reason: string; count: number; waived: string | null; due_at: string; date: string | null }>(
      `select d.reason, d.count, d.waived, d.due_at, l.date::text as date
       from public.makeup_debts d left join public.study_logs l on l.id = d.study_log_id
       where d.user_id = $1 order by d.created_at, l.date`,
      [userId],
    )
  ).rows;

const balance = async (db: Db, userId: string) =>
  (await db.query<Balance>("select * from private.makeup_balance($1, private.now())", [userId])).rows[0];

const declareMakeup = async (db: Db, userId: string, when: string) => {
  await setNow(db, when);
  return (await db.query<Event>("select * from public.declare_makeup($1, '3 章の演習をやり直す', 'もみじ 12')", [userId]))
    .rows[0];
};

/** Three days without declarations (everyone): P9 on the third. */
async function owesOne(db: Db) {
  for (const date of ["2026-10-19", "2026-10-20", "2026-10-21"]) await noDeclaration(db, date);
  await award(db, "2026-10-21 12:10");
}

describe("award_makeups (P9)", () => {
  it("is off until makeup_since, and counts only the days from it", async () => {
    const { db, aki } = await setup();
    await db.query("update public.group_settings set makeup_since = null");
    for (const date of ["2026-10-19", "2026-10-20", "2026-10-21"]) await noDeclaration(db, date);
    expect(await award(db, "2026-10-21 12:10")).toEqual([]);

    await db.query("update public.group_settings set makeup_since = '2026-10-20'");
    const since = await award(db, "2026-10-21 12:15"); // only two days since then: a warning, no debt
    expect(since.filter((e) => e.actor_id === aki).map((e) => e.type)).toEqual(["makeup_warning"]);
    await noDeclaration(db, "2026-10-22");
    await award(db, "2026-10-22 12:10");
    expect((await debts(db, aki)).map((d) => d.date)).toEqual(["2026-10-22"]);
  });

  it("owes one session from the third slacking day in a row, and one more each day it goes on", async () => {
    const { db, aki } = await setup();
    await noDeclaration(db, "2026-10-19"); // P1
    await missDay(db, aki, "2026-10-20", "slacked"); // P2
    const warned = (await award(db, "2026-10-20 15:10")).filter((e) => e.actor_id === aki);
    expect(warned.map((e) => [e.type, e.payload.streak])).toEqual([["makeup_warning", 2]]);

    await noDeclaration(db, "2026-10-21"); // P1: third in a row
    const events = await award(db, "2026-10-21 12:10");
    expect(events.filter((e) => e.actor_id === aki)).toHaveLength(1);
    expect(events.find((e) => e.actor_id === aki && e.type === "makeup_assigned")).toMatchObject({ type: "makeup_assigned", actor_id: aki, payload: { count: 1, streak: 3, waived: null } });
    // Due at the close of the week after this one (this week closes 10-24).
    expect(new Date(events.find((e) => e.actor_id === aki)!.payload.due_at as string).toISOString()).toBe("2026-10-31T14:59:00.000Z");

    expect(await award(db, "2026-10-21 12:15")).toEqual([]); // once per day
    await noDeclaration(db, "2026-10-22");
    await award(db, "2026-10-22 12:10");
    expect((await debts(db, aki)).map((d) => d.date)).toEqual(["2026-10-21", "2026-10-22"]);
  });

  it("resets on a completed day; P3 days neither count nor reset", async () => {
    const { db, aki } = await setup();
    await noDeclaration(db, "2026-10-19");
    await noDeclaration(db, "2026-10-20");
    await completeDay(db, aki, "2026-10-21"); // reset
    await noDeclaration(db, "2026-10-22");
    await missDay(db, aki, "2026-10-23", "unrealistic"); // P3: neutral
    await noDeclaration(db, "2026-10-24");
    expect((await award(db, "2026-10-24 12:10")).filter((e) => e.actor_id === aki && e.type === "makeup_assigned")).toEqual([]);
    await noDeclaration(db, "2026-10-25");
    await award(db, "2026-10-25 12:10");
    expect((await debts(db, aki)).map((d) => d.date)).toEqual(["2026-10-25"]);
  });

  it("counts a day once it is settled, even after a later day (P5 decided after the next P1)", async () => {
    const { db, aki } = await setup();
    await noDeclaration(db, "2026-10-19");
    const logId = await declare(db, aki, "2026-10-20");
    await setNow(db, "2026-10-20 15:05");
    await db.query("select * from public.give_up_day($1, $2)", [aki, logId]); // awaiting a report
    await noDeclaration(db, "2026-10-21");
    await noDeclaration(db, "2026-10-22");
    expect((await award(db, "2026-10-22 12:10")).filter((e) => e.actor_id === aki && e.type === "makeup_assigned")).toEqual([]); // 10-20 isn't settled yet

    await setNow(db, "2026-10-21 23:05"); // the report deadline passed: P5
    await db.query("select * from public.expire_reports()");
    await award(db, "2026-10-22 12:15");
    expect((await debts(db, aki)).map((d) => d.date)).toEqual(["2026-10-21", "2026-10-22"]);
  });

  it("waives trial days, and a trial run doesn't carry into the real weeks", async () => {
    const { db, aki } = await setup();
    await db.query("update public.profiles set trial_ends_at = '2026-10-21 00:00+09' where id = $1", [aki]);
    for (const date of ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]) {
      await noDeclaration(db, date);
    }
    await award(db, "2026-10-22 12:10");
    expect((await debts(db, aki)).map((d) => [d.date, d.waived])).toEqual([
      ["2026-10-20", "trial"],
    ]);
    expect(await balance(db, aki)).toMatchObject({ owed: 0, trial_owed: 1, remaining: 0 });
  });
});

describe("makeup sessions", () => {
  it("need something owed, one a day, and pay back once confirmed", async () => {
    const { db, aki } = await setup();
    await expect(declareMakeup(db, aki, "2026-10-18 20:00")).rejects.toThrow(/no_makeup_due/);
    await owesOne(db);

    const event = await declareMakeup(db, aki, "2026-10-21 22:00");
    expect(event).toMatchObject({ type: "makeup_declared", payload: { remaining: 1 } });
    const logId = event.study_log_id!;
    const { rows: [log] } = await db.query<{ is_makeup: boolean; date: string; target_end_time: string }>(
      "select is_makeup, date::text, target_end_time from public.study_logs where id = $1",
      [logId],
    );
    expect(log).toMatchObject({ is_makeup: true, date: "2026-10-21" });
    expect(new Date(log.target_end_time).toISOString()).toBe("2026-10-22T13:00:00.000Z"); // 24 hours
    await expect(declareMakeup(db, aki, "2026-10-21 23:00")).rejects.toThrow(/no_makeup_due/); // the one owed is running
    expect(await balance(db, aki)).toMatchObject({ owed: 1, open: 1, remaining: 1 });

    // A day's declaration is unaffected: the next morning still works.
    await declare(db, aki, "2026-10-22");

    await setNow(db, "2026-10-22 08:00");
    await submitAndPass(db, aki, logId, "2026-10-21");
    expect(await balance(db, aki)).toMatchObject({ reviewing: 1, remaining: 0 });
    await setNow(db, "2026-10-23 08:30");
    const confirmed = (await db.query<Event>("select * from public.confirm_passed_logs()")).rows;
    expect(confirmed.map((e) => e.type)).toEqual(["makeup_completed"]);
    expect(await balance(db, aki)).toMatchObject({ owed: 1, completed: 1, remaining: 0, overdue: 0, next_due_at: null });
  });

  it("allows one session a day even with more owed", async () => {
    const { db, aki } = await setup();
    await owesOne(db);
    await noDeclaration(db, "2026-10-22");
    await award(db, "2026-10-22 12:10"); // owes 2
    await declareMakeup(db, aki, "2026-10-22 13:00");
    await expect(declareMakeup(db, aki, "2026-10-22 14:00")).rejects.toThrow(/makeup_already_today/);
    await expect(declareMakeup(db, aki, "2026-10-23 09:00")).resolves.toMatchObject({ type: "makeup_declared" });
  });

  it("fail without a report or a penalty, and stay out of the study days", async () => {
    const { db, aki, ben } = await setup();
    await owesOne(db);
    const { study_log_id: logId } = await declareMakeup(db, aki, "2026-10-21 13:00");

    // 「軽すぎる」 after midnight still works for a session; not rewriting cancels it (no P6).
    await setNow(db, "2026-10-21 14:00");
    await db.query("select * from public.flag_declaration($1, $2, 'もっと量を増やして')", [ben, logId]);
    await setNow(db, "2026-10-21 15:01");
    const expired = (await db.query<Event>("select * from public.expire_revisions()")).rows;
    expect(expired.map((e) => [e.type, e.payload.cause])).toEqual([["makeup_failed", "unrevised"]]);

    const { rows: penalties } = await db.query("select reason from public.penalties where study_log_id = $1", [logId]);
    expect(penalties).toEqual([]);
    const { rows: reports } = await db.query("select 1 from public.failure_reports where study_log_id = $1", [logId]);
    expect(reports).toEqual([]);
    expect(await balance(db, aki)).toMatchObject({ remaining: 1, open: 0 });

    // The next day: past the 24 hours.
    const second = await declareMakeup(db, aki, "2026-10-22 13:00");
    await setNow(db, "2026-10-23 13:01");
    const closed = (await db.query<Event>("select * from public.close_overdue_logs()")).rows;
    expect(closed.find((e) => e.study_log_id === second.study_log_id)).toMatchObject({
      type: "makeup_failed",
      payload: { cause: "deadline" },
    });

    const { rows: history } = await db.query<{ date: string; kind: string }>(
      "select date::text, kind from public.daily_history where user_id = $1 and date between '2026-10-21' and '2026-10-22' order by date",
      [aki],
    );
    expect(history).toEqual([
      { date: "2026-10-21", kind: "no_declaration" },
      { date: "2026-10-22", kind: "none" }, // the session that day isn't a study day
    ]);
  });
});

describe("due_makeup_reminders", () => {
  it("reminds 24 hours and 1 hour before the due time, once each", async () => {
    const { db, aki } = await setup();
    await owesOne(db); // due 10-31 23:59
    const remind = async (when: string) => {
      await setNow(db, when);
      return (await db.query<Event>("select * from public.due_makeup_reminders()")).rows.filter((e) => e.actor_id === aki);
    };
    expect(await remind("2026-10-30 23:58")).toEqual([]);
    expect((await remind("2026-10-31 00:02")).map((e) => e.payload.hours_left)).toEqual([24]);
    expect(await remind("2026-10-31 12:00")).toEqual([]);
    expect((await remind("2026-10-31 23:00")).map((e) => e.payload.hours_left)).toEqual([1]);
    expect(await remind("2026-10-31 23:05")).toEqual([]);
  });

  it("sends only the 1-hour one when the 24-hour one was missed", async () => {
    const { db, aki } = await setup();
    await owesOne(db);
    await setNow(db, "2026-10-31 23:10");
    const rows = (await db.query<Event>("select * from public.due_makeup_reminders()")).rows.filter((e) => e.actor_id === aki);
    expect(rows.map((e) => e.payload.hours_left)).toEqual([1]);
  });
});

describe("close_makeup_week (P10)", () => {
  it("adds one more each week while something due is unpaid", async () => {
    const { db, aki } = await setup();
    await owesOne(db); // due 10-31 23:59

    await setNow(db, "2026-10-25 00:02"); // the close of 10-24: nothing due yet
    const mine = (events: Event[]) => events.filter((e) => e.actor_id === aki);
    const first = mine((await db.query<Event>("select * from public.close_makeup_week()")).rows);
    expect(first.map((e) => [e.type, e.payload.remaining])).toEqual([["makeup_due", 1]]);

    await setNow(db, "2026-11-01 00:02");
    const second = mine((await db.query<Event>("select * from public.close_makeup_week()")).rows);
    expect(second.map((e) => e.type)).toEqual(["makeup_overdue", "makeup_due"]);
    expect(second[1].payload).toMatchObject({ remaining: 2, overdue: 1 });
    expect((await db.query<Event>("select * from public.close_makeup_week()")).rows).toEqual([]); // once a week

    const all = await debts(db, aki);
    expect(all.map((d) => [d.reason, d.count])).toEqual([
      ["slack_streak", 1],
      ["overdue", 1],
    ]);
    expect(new Date(all[1].due_at).toISOString()).toBe("2026-11-07T14:59:00.000Z");

    await setNow(db, "2026-11-08 00:02");
    const third = mine((await db.query<Event>("select * from public.close_makeup_week()")).rows);
    expect(third.map((e) => e.type)).toEqual(["makeup_overdue", "makeup_due"]);
    expect(third[1].payload).toMatchObject({ remaining: 3, overdue: 2 });
  });

  it("counts a session that passed before the close, and skips the week on leave", async () => {
    const { db, aki, ben } = await setup();
    await owesOne(db);
    const { study_log_id: logId } = await declareMakeup(db, aki, "2026-10-31 10:00");
    await setNow(db, "2026-10-31 20:00");
    await submitAndPass(db, aki, logId!, "2026-10-31"); // still in the 「怪しい」 window at the close
    await setNow(db, "2026-11-01 00:02");
    const closed = (await db.query<Event>("select * from public.close_makeup_week()")).rows;
    expect(closed.filter((e) => e.actor_id === aki)).toEqual([]);
    expect(closed.filter((e) => e.actor_id === ben).map((e) => e.type)).toEqual(["makeup_overdue", "makeup_due"]);

    // ben owes one too and is on leave over the close.
    const { db: db2, aki: aki2, ben: ben2 } = await setup();
    await owesOne(db2);
    await db2.query(
      `insert into public.leave_requests (user_id, start_date, end_date, reason, status, review_due_at, approved_at, resolved_at)
       values ($1, '2026-10-30', '2026-11-02', $2, 'approved', '2026-10-25 23:59+09', '2026-10-25 10:00+09', '2026-10-25 10:00+09')`,
      [ben2, PLAN],
    );
    await setNow(db2, "2026-11-01 00:02");
    const events = (await db2.query<Event>("select * from public.close_makeup_week()")).rows;
    expect(events.filter((e) => e.actor_id === ben2).map((e) => e.type)).toEqual(["makeup_due"]);
    expect(events.filter((e) => e.actor_id === aki2).map((e) => e.type)).toEqual(["makeup_overdue", "makeup_due"]);
  });
});

describe("update_group_settings (makeup_enabled)", () => {
  it("turns makeup study on from today and off again", async () => {
    const { db, aki } = await setup();
    await db.query("update public.group_settings set makeup_since = null");
    await setNow(db, "2026-10-20 09:00");
    const since = async () =>
      (await db.query<{ makeup_since: string | null }>("select makeup_since::text from public.group_settings")).rows[0].makeup_since;
    await db.query(`select public.update_group_settings($1, '{"makeup_enabled": true}')`, [aki]);
    expect(await since()).toBe("2026-10-20");
    await setNow(db, "2026-10-22 09:00");
    await db.query(`select public.update_group_settings($1, '{"makeup_hours": 12}')`, [aki]);
    expect(await since()).toBe("2026-10-20"); // untouched by other changes
    await db.query(`select public.update_group_settings($1, '{"makeup_enabled": true}')`, [aki]);
    expect(await since()).toBe("2026-10-20"); // already on: keeps its start
    await db.query(`select public.update_group_settings($1, '{"makeup_enabled": false}')`, [aki]);
    expect(await since()).toBeNull();
    await expect(db.query(`select public.update_group_settings($1, '{"makeup_enabled": "maybe"}')`, [aki])).rejects.toThrow(
      /invalid_setting/,
    );
  });
});

describe("makeup_summary", () => {
  it("is readable by the group under RLS", async () => {
    const { db, aki, ben } = await setup();
    await owesOne(db);
    await setNow(db, "2026-10-22 09:00");
    const rows = await asUser(db, ben, async (tx) =>
      (await tx.query<Balance & { user_id: string }>("select * from public.makeup_summary order by user_id")).rows,
    );
    expect(rows.find((r) => r.user_id === aki)).toMatchObject({ owed: 1, remaining: 1 });
    expect(rows).toHaveLength(3);
  });
});
