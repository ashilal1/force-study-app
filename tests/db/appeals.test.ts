import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asUser, createMember, createTestDb, setNow, type Db } from "./harness";

// F5c: asking the members to judge a day the AI rejected every time (ADR-048). Times are JST.

type Event = { type: string; actor_id: string; payload: Record<string, unknown> };

const REASON = "ノートに 3 章の演習を 12 問解いたが、写真が暗くて合言葉が読めなかったみたい";

async function setup() {
  const db = await createTestDb();
  await setNow(db, "2026-10-01 09:00");
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  const cho = await createMember(db, "cho");
  await db.query("update public.profiles set trial_ends_at = '2026-01-01', created_at = '2026-10-01'::timestamptz + (created_at - (select min(created_at) from public.profiles))");
  return { db, aki, ben, cho };
}

async function declare(db: Db, userId: string, date: string): Promise<string> {
  await setNow(db, `${date} 09:00`);
  const { rows } = await db.query<{ study_log_id: string }>(
    "select study_log_id from public.declare_goal($1, '演習', '15:00'::time, 'さくら 47')",
    [userId],
  );
  return rows[0].study_log_id;
}

/** Submits and gets rejected `times` times (from 10:00 on `date`). Returns the last submission. */
async function reject(db: Db, userId: string, logId: string, date: string, times = 3): Promise<string> {
  let last = "";
  for (let i = 0; i < times; i++) {
    await setNow(db, `${date} 1${i}:00`);
    const { rows } = await db.query<{ submission_id: string }>(
      "select submission_id from public.create_submission($1, $2, $3, null, 'a', 'b', 3)",
      [userId, logId, [`${userId}/${date}/${randomUUID()}.webp`]],
    );
    last = rows[0].submission_id;
    await db.query("select public.record_judgement($1, 40, false, 'no', 'test')", [last]);
  }
  return last;
}

async function appeal(db: Db, userId: string, logId: string, reason = REASON) {
  return (await db.query<Event>("select * from public.appeal_judgement($1, $2, $3)", [userId, logId, reason])).rows;
}

async function vote(db: Db, reviewerId: string, logId: string, verdict: "accept" | "reject", comment = "") {
  return (
    await db.query<Event>("select * from public.cast_review($1, 'appeal', $2, $3, $4)", [reviewerId, logId, verdict, comment])
  ).rows;
}

const logStatus = async (db: Db, logId: string) =>
  (await db.query<{ status: string }>("select status from public.study_logs where id = $1", [logId])).rows[0].status;

const appealStatus = async (db: Db, logId: string) =>
  (await db.query<{ status: string }>("select status from public.judge_appeals where study_log_id = $1", [logId])).rows[0]?.status;

describe("appeal_judgement", () => {
  it("opens a review for everyone else once every attempt was rejected", async () => {
    const { db, aki, ben, cho } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    const submissionId = await reject(db, aki, logId, "2026-10-20");
    await setNow(db, "2026-10-20 13:00");
    const [event] = await appeal(db, aki, logId);
    expect(event).toMatchObject({ type: "appeal_requested", actor_id: aki, payload: { reason: REASON, score: 40 } });
    expect(new Set(event.payload.reviewer_ids as string[])).toEqual(new Set([ben, cho]));
    const { rows } = await db.query("select submission_id, status from public.judge_appeals where study_log_id = $1", [logId]);
    expect(rows).toEqual([{ submission_id: submissionId, status: "under_review" }]);
    expect(await logStatus(db, logId)).toBe("pending");
  });

  it("needs every attempt used, a rejected last one, a reason, and only once a day", async () => {
    const { db, aki } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await setNow(db, "2026-10-20 09:30");
    await expect(appeal(db, aki, logId)).rejects.toThrow(/appeal_not_rejected/);
    await reject(db, aki, logId, "2026-10-20", 2);
    await expect(appeal(db, aki, logId)).rejects.toThrow(/attempts_remaining/);
    await reject(db, aki, logId, "2026-10-20", 1);
    await expect(appeal(db, aki, logId, "短い")).rejects.toThrow(/reason_too_short/);
    await appeal(db, aki, logId);
    await expect(appeal(db, aki, logId)).rejects.toThrow(/already_appealed/);
  });

  it("is only for one's own open day, before its deadline", async () => {
    const { db, aki, ben } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await reject(db, aki, logId, "2026-10-20");
    await expect(appeal(db, ben, logId)).rejects.toThrow(/not_found/);
    await setNow(db, "2026-10-21 12:00");
    await expect(appeal(db, aki, logId)).rejects.toThrow(/deadline_passed/);
  });

  it("allows appeals_per_week a week (Sunday to Saturday)", async () => {
    const { db, aki, ben, cho } = await setup();
    await db.query("update public.group_settings set appeals_per_week = 1");
    const monday = await declare(db, aki, "2026-10-19");
    await reject(db, aki, monday, "2026-10-19");
    await appeal(db, aki, monday);
    await vote(db, ben, monday, "accept");
    await vote(db, cho, monday, "accept");
    const tuesday = await declare(db, aki, "2026-10-20");
    await reject(db, aki, tuesday, "2026-10-20");
    await expect(appeal(db, aki, tuesday)).rejects.toThrow(/appeal_limit/);
    await db.query("select public.give_up_day($1, $2)", [aki, tuesday]);
    await db.query("select * from public.file_failure_report($1, $2, 'slacked', null)", [aki, tuesday]);
    // A new week (Sunday) starts over.
    const sunday = await declare(db, aki, "2026-10-25");
    await reject(db, aki, sunday, "2026-10-25");
    await expect(appeal(db, aki, sunday)).resolves.toHaveLength(1);
  });

  it("stands at once when there is nobody else to ask", async () => {
    const db = await createTestDb();
    await setNow(db, "2026-10-01 09:00");
    const solo = await createMember(db, "solo");
    await db.query("update public.profiles set trial_ends_at = '2026-01-01'");
    const logId = await declare(db, solo, "2026-10-20");
    await reject(db, solo, logId, "2026-10-20");
    const events = await appeal(db, solo, logId);
    expect(events.map((event) => event.type)).toEqual(["appeal_requested", "appeal_accepted"]);
    expect(await logStatus(db, logId)).toBe("completed");
  });
});

describe("reviewing an appeal", () => {
  it("completes the day when everyone accepts", async () => {
    const { db, aki, ben, cho } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await reject(db, aki, logId, "2026-10-20");
    await appeal(db, aki, logId);
    const [cast] = await vote(db, ben, logId, "accept");
    expect(cast).toMatchObject({ type: "review_vote_cast", payload: { subject_type: "appeal", owner_id: aki, accepted: 1, total: 2 } });
    const events = await vote(db, cho, logId, "accept");
    expect(events.map((event) => event.type)).toEqual(["review_vote_cast", "appeal_accepted"]);
    expect(await logStatus(db, logId)).toBe("completed");
    expect(await appealStatus(db, logId)).toBe("accepted");
    await expect(vote(db, ben, logId, "reject", "やっぱり")).rejects.toThrow(/already_reviewed/);
  });

  it("misses the day on one reasoned reject, and the reason report follows", async () => {
    const { db, aki, ben } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await reject(db, aki, logId, "2026-10-20");
    await appeal(db, aki, logId);
    await expect(vote(db, ben, logId, "reject")).rejects.toThrow(/comment_required/);
    const events = await vote(db, ben, logId, "reject", "写真に宣言の 3 章が写っていない");
    expect(events.at(-1)).toMatchObject({
      type: "appeal_rejected",
      actor_id: aki,
      payload: { expired: false, rejected_by: ben, comment: "写真に宣言の 3 章が写っていない" },
    });
    expect(await logStatus(db, logId)).toBe("missed");
    const { rows } = await db.query("select status from public.failure_reports where study_log_id = $1", [logId]);
    expect(rows).toEqual([{ status: "awaiting_report" }]);
    // No penalty from the appeal itself.
    expect((await db.query("select * from public.penalties where user_id = $1", [aki])).rows).toEqual([]);
  });

  it("rejects when not everyone accepted in time, giving at least six hours to report", async () => {
    const { db, aki, ben } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await reject(db, aki, logId, "2026-10-20");
    await setNow(db, "2026-10-21 11:00");
    await appeal(db, aki, logId);
    await vote(db, ben, logId, "accept");
    // The day's deadline (12:00) passes while the members decide: it stays open.
    await setNow(db, "2026-10-21 12:30");
    await db.query("select * from public.tick()");
    expect(await logStatus(db, logId)).toBe("pending");
    await setNow(db, "2026-10-22 11:01");
    const events = (await db.query<Event>("select * from public.tick()")).rows;
    expect(events.find((event) => event.type === "appeal_rejected")).toMatchObject({ payload: { expired: true } });
    expect(await logStatus(db, logId)).toBe("missed");
    const { rows } = await db.query<{ due: string }>(
      "select to_char(report_due_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') as due from public.failure_reports where study_log_id = $1",
      [logId],
    );
    expect(rows[0].due).toBe("2026-10-22 17:01");
  });

  it("reminds reviewers who have not answered three hours and one hour before", async () => {
    const { db, aki, ben, cho } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await reject(db, aki, logId, "2026-10-20");
    await setNow(db, "2026-10-20 13:00");
    await appeal(db, aki, logId);
    await vote(db, ben, logId, "accept");
    await setNow(db, "2026-10-21 10:30");
    const events = (await db.query<Event>("select * from public.tick()")).rows.filter((event) => event.type === "reminder_review_due");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor_id: cho, payload: { subject_type: "appeal", owner_id: aki } });
  });
});

describe("while the members decide", () => {
  it("lets the member declare the next day, but not give up the appealed one", async () => {
    const { db, aki } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await reject(db, aki, logId, "2026-10-20");
    await setNow(db, "2026-10-20 13:00");
    await appeal(db, aki, logId);
    await expect(db.query("select public.give_up_day($1, $2)", [aki, logId])).rejects.toThrow(/appeal_open/);
    await setNow(db, "2026-10-21 08:00");
    await expect(
      db.query("select public.declare_goal($1, '演習', '15:00'::time, 'うみ 12')", [aki]),
    ).resolves.toBeDefined();
  });

  it("closes the appeal without a penalty when the member is removed", async () => {
    const { db, aki, ben } = await setup();
    await db.query("update public.profiles set is_admin = true where id = $1", [ben]);
    const logId = await declare(db, aki, "2026-10-20");
    await reject(db, aki, logId, "2026-10-20");
    await appeal(db, aki, logId);
    await db.query("select * from public.remove_member($1, $2)", [ben, aki]);
    expect(await appealStatus(db, logId)).toBe("cancelled");
    expect(await logStatus(db, logId)).toBe("missed");
  });

  it("decides when the last reviewer who had not answered leaves", async () => {
    const { db, aki, ben, cho } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await reject(db, aki, logId, "2026-10-20");
    await appeal(db, aki, logId);
    await vote(db, ben, logId, "accept");
    await db.query("select * from public.leave_group($1)", [cho]);
    expect(await logStatus(db, logId)).toBe("completed");
  });

  it("is readable by the group and not writable from the browser", async () => {
    const { db, aki, ben } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await reject(db, aki, logId, "2026-10-20");
    await appeal(db, aki, logId);
    const seen = await asUser(db, ben, async (tx) => (await tx.query("select status from public.judge_appeals")).rows);
    expect(seen).toEqual([{ status: "under_review" }]);
    await expect(
      asUser(db, aki, (tx) => tx.query("update public.judge_appeals set status = 'accepted'")),
    ).rejects.toThrow();
    await expect(db.query("delete from public.judge_appeals")).rejects.toThrow(/append-only/);
  });
});
