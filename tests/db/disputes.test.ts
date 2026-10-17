import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMember, createTestDb, setNow, type Db } from "./harness";

// M5b: 「怪しい」 (F5b), with the 24-hour windows of ADR-032. Times are JST. aki submits and passes
// at 13:00 on Tuesday 10-20, so 「怪しい」 is open until 13:00 on 10-21; a flag at 14:00 on 10-20
// leaves 24 hours (until 14:00 on 10-21) to resend, and the final review gets 24 hours more.

type Event = { type: string; study_log_id: string; submission_id: string; payload: Record<string, unknown> };

async function setup() {
  const db = await createTestDb();
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  const cho = await createMember(db, "cho");
  await db.query("update public.profiles set trial_ends_at = '2026-01-01'");
  await setNow(db, "2026-10-20 09:00");
  const { rows } = await db.query<{ study_log_id: string }>(
    "select study_log_id from public.declare_goal($1, '演習 10 問', '15:00'::time, 'さくら 47')",
    [aki],
  );
  const logId = rows[0].study_log_id;
  await setNow(db, "2026-10-20 13:00");
  const sub = await db.query<Event>("select * from public.create_submission($1, $2, $3, null, '固有値', '重解', 4)", [
    aki,
    logId,
    [photo(aki)],
  ]);
  await db.query("select public.record_judgement($1, 85, true, 'よい', 'test')", [sub.rows[0].submission_id]);
  return { db, aki, ben, cho, logId };
}

const photo = (userId: string) => `${userId}/2026-10-20/${randomUUID()}.webp`;

const flag = (db: Db, flagger: string, logId: string, comment = "写真が昨日のものに見える") =>
  db.query<Event>("select * from public.flag_submission($1, $2, $3)", [flagger, logId, comment]);

const withdraw = async (db: Db, flagger: string, logId: string) =>
  (await db.query<Event>("select * from public.withdraw_flag($1, $2)", [flagger, logId])).rows.map((e) => e.type);

const vote = async (db: Db, reviewer: string, logId: string, verdict: string, comment: string | null = null) =>
  (await db.query<Event>("select * from public.cast_review($1, 'dispute', $2, $3, $4)", [reviewer, logId, verdict, comment])).rows.map(
    (e) => e.type,
  );

async function state(db: Db, logId: string) {
  const { rows } = await db.query<{ log: string; dispute: string | null }>(
    `select l.status as log, d.status as dispute
     from public.study_logs l left join public.submission_disputes d on d.study_log_id = l.id where l.id = $1`,
    [logId],
  );
  return rows[0];
}

describe("flag_submission", () => {
  it("opens a dispute on the first flag with 24 hours to resend", async () => {
    const { db, aki, ben, cho, logId } = await setup();
    await setNow(db, "2026-10-20 14:00");
    await expect(flag(db, aki, logId)).rejects.toThrow(/own_submission/);
    const { rows } = await flag(db, ben, logId);
    expect(rows[0]).toMatchObject({ type: "submission_flagged", payload: { owner_id: aki, flag_count: 1 } });
    expect(new Date(String(rows[0].payload.resend_due_at)).toISOString()).toBe("2026-10-21T05:00:00.000Z"); // 10-21 14:00
    await flag(db, cho, logId, "合言葉が読めない");
    await expect(flag(db, ben, logId)).rejects.toThrow(/already_flagged/);
    expect(await state(db, logId)).toEqual({ log: "passed", dispute: "resending" });
  });

  it("stays open through the night and closes 24 hours after the submission", async () => {
    const { db, cho, logId } = await setup();
    await setNow(db, "2026-10-21 12:59");
    await expect(flag(db, cho, logId)).resolves.toBeDefined();
    const fresh = await setup();
    await setNow(fresh.db, "2026-10-21 13:00");
    await expect(flag(fresh.db, fresh.ben, fresh.logId)).rejects.toThrow(/flag_closed/);
  });
});

describe("resend and withdraw", () => {
  it("completes the day when every flagger withdraws", async () => {
    const { db, aki, ben, cho, logId } = await setup();
    await setNow(db, "2026-10-20 14:00");
    await flag(db, ben, logId);
    await flag(db, cho, logId);

    await setNow(db, "2026-10-20 14:20");
    const resent = await db.query<{ id: string }>(
      "select id from public.resend_evidence($1, $2, $3, null, '途中の計算ノートも撮りました')",
      [aki, logId, [photo(aki)]],
    );
    const judged = await db.query<Event>("select * from public.record_judgement($1, 90, true, '十分', 'test')", [resent.rows[0].id]);
    expect(judged.rows[0]).toMatchObject({ type: "evidence_resent", payload: { flagger_ids: [ben, cho] } });

    expect(await withdraw(db, ben, logId)).toEqual(["flag_withdrawn"]);
    await expect(withdraw(db, ben, logId)).rejects.toThrow(/not_flagged/);
    expect(await withdraw(db, cho, logId)).toEqual(["flag_withdrawn", "dispute_upheld"]);
    expect(await state(db, logId)).toEqual({ log: "completed", dispute: "upheld" });
  });

  it("only lets the owner resend, until the resend deadline", async () => {
    const { db, aki, ben, logId } = await setup();
    await setNow(db, "2026-10-20 14:00");
    await flag(db, ben, logId);
    await expect(
      db.query("select public.resend_evidence($1, $2, $3, null, '説明')", [ben, logId, [photo(ben)]]),
    ).rejects.toThrow(/not_found/);
    await setNow(db, "2026-10-21 14:00");
    await expect(
      db.query("select public.resend_evidence($1, $2, $3, null, '説明')", [aki, logId, [photo(aki)]]),
    ).rejects.toThrow(/resend_closed/);
  });
});

describe("advance_disputes and the final review", () => {
  async function toFinalReview() {
    const ctx = await setup();
    await setNow(ctx.db, "2026-10-20 14:00");
    await flag(ctx.db, ctx.ben, ctx.logId);
    await setNow(ctx.db, "2026-10-21 13:10");
    const reminders = await ctx.db.query<Event>("select * from public.advance_disputes()");
    expect(reminders.rows.map((e) => e.type)).toEqual(["reminder_resend_due"]);
    await setNow(ctx.db, "2026-10-21 14:01");
    const started = await ctx.db.query<Event>("select * from public.advance_disputes()");
    expect(started.rows.map((e) => e.type)).toEqual(["dispute_final_review_started"]);
    expect(started.rows[0].payload.reviewer_ids).toEqual([ctx.ben, ctx.cho]);
    expect(new Date(String(started.rows[0].payload.review_due_at)).toISOString()).toBe("2026-10-22T05:01:00.000Z"); // 24 hours
    expect((await ctx.db.query("select * from public.advance_disputes()")).rows).toHaveLength(0);
    return ctx;
  }

  it("invalidates the day (P8) on one reasoned reject", async () => {
    const { db, aki, ben, logId } = await toFinalReview();
    await expect(vote(db, aki, logId, "accept")).rejects.toThrow(/not_a_reviewer/);
    await expect(vote(db, ben, logId, "reject")).rejects.toThrow(/comment_required/);
    expect(await vote(db, ben, logId, "reject", "合言葉が写っていない")).toEqual(["review_vote_cast", "dispute_invalidated"]);
    expect(await state(db, logId)).toEqual({ log: "invalidated", dispute: "invalidated" });
    const { rows } = await db.query("select reason, points from public.penalties");
    expect(rows).toEqual([{ reason: "fake_evidence", points: 200 }]);
  });

  it("upholds when everyone accepts", async () => {
    const { db, ben, cho, logId } = await toFinalReview();
    expect(await vote(db, ben, logId, "accept")).toEqual(["review_vote_cast"]);
    expect(await vote(db, cho, logId, "accept")).toEqual(["review_vote_cast", "dispute_upheld"]);
    expect(await state(db, logId)).toEqual({ log: "completed", dispute: "upheld" });
  });

  it("upholds when nobody rejects within 24 hours", async () => {
    const { db, ben, logId } = await toFinalReview();
    await vote(db, ben, logId, "accept");
    await setNow(db, "2026-10-22 14:02");
    const { rows } = await db.query<Event>("select * from public.advance_disputes()");
    expect(rows.map((e) => e.type)).toEqual(["dispute_upheld"]);
    expect(await state(db, logId)).toEqual({ log: "completed", dispute: "upheld" });
    expect((await db.query("select * from public.penalties")).rows).toHaveLength(0);
  });
});
