import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMember, createTestDb, setNow, type Db } from "./harness";

// M7a: reason reports (F6), excuse reviews (F7), P2-P5. Times are JST.

type Event = { type: string; actor_id: string; payload: Record<string, unknown> };

const PLAN = "次は 3 章を 2 日に分けて、例題を先に解いてから演習に入る";
const REASON = "親が急に入院して病院に付き添っていたので、夜まで勉強できませんでした";

async function setup() {
  const db = await createTestDb();
  await setNow(db, "2026-10-01 09:00");
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  const cho = await createMember(db, "cho");
  await db.query("update public.profiles set trial_ends_at = '2026-01-01', created_at = '2026-10-01'::timestamptz + (created_at - (select min(created_at) from public.profiles))");
  return { db, aki, ben, cho };
}

/** Declares on `date` (YYYY-MM-DD), then gives up at 15:05 (「できなかった」): the day is missed. */
async function missDay(db: Db, userId: string, date: string): Promise<string> {
  await setNow(db, `${date} 09:00`);
  const { rows } = await db.query<{ study_log_id: string }>(
    "select study_log_id from public.declare_goal($1, '演習', '15:00'::time, 'さくら 47')",
    [userId],
  );
  await setNow(db, `${date} 15:05`);
  await db.query("select * from public.give_up_day($1, $2)", [userId, rows[0].study_log_id]);
  return rows[0].study_log_id;
}

async function completeDay(db: Db, userId: string, date: string) {
  await setNow(db, `${date} 09:00`);
  const { rows } = await db.query<{ study_log_id: string }>(
    "select study_log_id from public.declare_goal($1, '演習', '15:00'::time, 'さくら 47')",
    [userId],
  );
  await setNow(db, `${date} 10:00`);
  const sub = await db.query<{ submission_id: string }>(
    "select submission_id from public.create_submission($1, $2, $3, null, 'a', 'b', 3)",
    [userId, rows[0].study_log_id, [`${userId}/${date}/${randomUUID()}.webp`]],
  );
  await db.query("select public.record_judgement($1, 90, true, 'ok', 'test')", [sub.rows[0].submission_id]);
  await setNow(db, `${date} 14:00`);
  await db.query("select * from public.confirm_passed_logs()");
}

async function report(db: Db, userId: string, logId: string, category: string, text: string | null = PLAN) {
  const { rows } = await db.query<Event>("select * from public.file_failure_report($1, $2, $3, $4)", [
    userId,
    logId,
    category,
    text,
  ]);
  return rows;
}

const pointsFor = async (db: Db, userId: string) =>
  (await db.query<{ reason: string; points: number }>("select reason, points from public.penalties where user_id = $1 order by created_at", [userId])).rows;

describe("file_failure_report", () => {
  it("charges P2 for slacking, and the report can't be changed", async () => {
    const { db, aki } = await setup();
    const logId = await missDay(db, aki, "2026-10-20");
    const [event] = await report(db, aki, logId, "slacked", null);
    expect(event).toMatchObject({ type: "reported", payload: { category: "slacked", points: 700 } });
    await expect(report(db, aki, logId, "other", REASON)).rejects.toThrow(/already_reported/);
    expect(await pointsFor(db, aki)).toEqual([{ reason: "slacked", points: 700 }]);
  });

  it("needs a long enough next plan or reason, and closes at 23:00 the next day", async () => {
    const { db, aki } = await setup();
    const logId = await missDay(db, aki, "2026-10-20");
    await expect(report(db, aki, logId, "unrealistic", "短い")).rejects.toThrow(/reason_too_short/);
    await setNow(db, "2026-10-21 23:00:30");
    await expect(report(db, aki, logId, "unrealistic", PLAN)).rejects.toThrow(/report_closed/);
  });

  it("charges P5 when nothing is reported by 23:00 the next day", async () => {
    const { db, aki } = await setup();
    await missDay(db, aki, "2026-10-20");
    await setNow(db, "2026-10-21 22:59");
    expect((await db.query("select * from public.expire_reports()")).rows).toHaveLength(0);
    await setNow(db, "2026-10-21 23:01");
    const expired = await db.query<Event>("select * from public.expire_reports()");
    expect(expired.rows.map((e) => [e.type, e.payload.points])).toEqual([["report_expired", 700]]);
    expect(await pointsFor(db, aki)).toEqual([{ reason: "not_reported", points: 700 }]);
    expect((await db.query("select * from public.expire_reports()")).rows).toHaveLength(0);
  });
});

describe("P3: unrealistic in a row", () => {
  it("is free three times and charges from the fourth", async () => {
    const { db, aki } = await setup();
    const streaks: unknown[] = [];
    for (const day of ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]) {
      const logId = await missDay(db, aki, day);
      const [event] = await report(db, aki, logId, "unrealistic");
      streaks.push([event.payload.streak, event.payload.points]);
    }
    expect(streaks).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 500],
      [5, 500],
    ]);
  });

  it("resets after an achieved day or a miss for another reason", async () => {
    const { db, aki } = await setup();
    await report(db, aki, await missDay(db, aki, "2026-10-19"), "unrealistic");
    await report(db, aki, await missDay(db, aki, "2026-10-20"), "unrealistic");
    await completeDay(db, aki, "2026-10-21");
    const [afterAchieved] = await report(db, aki, await missDay(db, aki, "2026-10-22"), "unrealistic");
    expect(afterAchieved.payload.streak).toBe(1);

    await report(db, aki, await missDay(db, aki, "2026-10-23"), "slacked", null);
    const [afterSlacked] = await report(db, aki, await missDay(db, aki, "2026-10-24"), "unrealistic");
    expect(afterSlacked.payload.streak).toBe(1);
  });

  it("skips days without a declaration and rest days", async () => {
    const { db, aki } = await setup();
    await report(db, aki, await missDay(db, aki, "2026-10-19"), "unrealistic");
    await setNow(db, "2026-10-20 12:05");
    await db.query("select * from public.close_declarations()"); // 10-20: no declaration (P1)
    await db.query("insert into public.rest_days (user_id, date) values ($1, '2026-10-21')", [aki]);
    const [event] = await report(db, aki, await missDay(db, aki, "2026-10-22"), "unrealistic");
    expect(event.payload.streak).toBe(2);
  });

  it("stops at a day that isn't settled yet", async () => {
    const { db, aki } = await setup();
    await report(db, aki, await missDay(db, aki, "2026-10-19"), "unrealistic");
    await report(db, aki, await missDay(db, aki, "2026-10-20"), "other", REASON); // still under review
    const [event] = await report(db, aki, await missDay(db, aki, "2026-10-21"), "unrealistic");
    expect(event.payload.streak).toBe(1);
  });
});

describe("excuse reviews (P4)", () => {
  it("asks everyone else, and approves at 0 yen when all accept", async () => {
    const { db, aki, ben, cho } = await setup();
    const logId = await missDay(db, aki, "2026-10-20");
    const events = await report(db, aki, logId, "sudden_plan", REASON);
    expect(events.map((e) => e.type)).toEqual(["reported", "review_requested"]);
    expect(events[1].payload.reviewer_ids).toEqual([ben, cho]);

    const vote = async (who: string, verdict: string) =>
      (await db.query<Event>("select * from public.cast_review($1, 'excuse', $2, $3, null)", [who, logId, verdict])).rows.map(
        (e) => e.type,
      );
    expect(await vote(ben, "accept")).toEqual(["review_vote_cast"]);
    expect(await vote(cho, "accept")).toEqual(["review_vote_cast", "review_approved"]);
    expect(await pointsFor(db, aki)).toEqual([]);
  });

  it("charges P4 on one reject", async () => {
    const { db, aki, ben } = await setup();
    const logId = await missDay(db, aki, "2026-10-20");
    await report(db, aki, logId, "other", REASON);
    const { rows } = await db.query<Event>("select * from public.cast_review($1, 'excuse', $2, 'reject', '前日に分かっていたはず')", [
      ben,
      logId,
    ]);
    expect(rows.map((e) => e.type)).toEqual(["review_vote_cast", "review_rejected"]);
    expect(await pointsFor(db, aki)).toEqual([{ reason: "excuse_rejected", points: 500 }]);
  });

  it("charges P4 when the votes aren't in within 24 hours", async () => {
    const { db, aki, ben } = await setup();
    const logId = await missDay(db, aki, "2026-10-20");
    await report(db, aki, logId, "other", REASON);
    await db.query("select * from public.cast_review($1, 'excuse', $2, 'accept', null)", [ben, logId]);
    await setNow(db, "2026-10-21 15:04");
    expect((await db.query("select * from public.expire_reviews()")).rows).toHaveLength(0);
    await setNow(db, "2026-10-21 15:06");
    const { rows } = await db.query<Event>("select * from public.expire_reviews()");
    expect(rows.map((e) => [e.type, e.payload.expired])).toEqual([["review_rejected", true]]);
    expect(await pointsFor(db, aki)).toEqual([{ reason: "excuse_expired", points: 500 }]);
  });
});

describe("review reminders", () => {
  it("reminds reviewers 3 hours and 1 hour before a reason review closes", async () => {
    const { db, aki, ben } = await setup();
    const logId = await missDay(db, aki, "2026-10-20");
    await report(db, aki, logId, "other", REASON); // review due 10-21 15:05
    await setNow(db, "2026-10-21 12:04");
    expect((await db.query("select * from public.due_deadline_reminders()")).rows).toHaveLength(0);
    await setNow(db, "2026-10-21 12:10");
    const first = await db.query<Event>("select * from public.due_deadline_reminders()");
    expect(first.rows.map((e) => [e.type, e.actor_id]).sort()).toHaveLength(2);
    await setNow(db, "2026-10-21 14:10");
    const second = await db.query<Event>("select * from public.due_deadline_reminders()");
    expect(second.rows.filter((e) => e.actor_id === ben)).toHaveLength(1);
    expect((await db.query("select * from public.due_deadline_reminders()")).rows).toHaveLength(0);
  });
});

describe("evening reminders for reports", () => {
  it("reminds at 22:00 and 22:45 on the day the report is due", async () => {
    const { db, aki } = await setup();
    await missDay(db, aki, "2026-10-20");
    await setNow(db, "2026-10-20 22:01");
    expect((await db.query("select * from public.due_deadline_reminders()")).rows).toHaveLength(0);
    await setNow(db, "2026-10-21 22:01");
    const first = await db.query<Event>("select * from public.due_deadline_reminders()");
    expect(first.rows.map((e) => e.type)).toEqual(["reminder_report_due"]);
    await setNow(db, "2026-10-21 22:46");
    const second = await db.query<Event>("select * from public.due_deadline_reminders()");
    expect(second.rows.map((e) => e.type)).toEqual(["reminder_report_due"]);
    expect((await db.query("select * from public.due_deadline_reminders()")).rows).toHaveLength(0);
  });
});
