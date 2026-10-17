import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMember, createTestDb, setNow, type Db } from "./harness";

// M5a: submissions and AI judgement (F4b, F5). Times are JST on Tuesday 2026-10-20.

type Event = { type: string; submission_id: string; study_log_id: string; payload: Record<string, unknown> };

const path = (userId: string, thumb = false) => `${userId}/2026-10-20/${randomUUID()}${thumb ? "_thumb" : ""}.webp`;

async function setup() {
  const db = await createTestDb();
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  await db.query("update public.profiles set trial_ends_at = '2026-01-01'");
  await setNow(db, "2026-10-20 09:00");
  const { rows } = await db.query<{ study_log_id: string }>(
    "select study_log_id from public.declare_goal($1, '演習 10 問', '15:00'::time, 'さくら 47')",
    [aki],
  );
  return { db, aki, ben, logId: rows[0].study_log_id };
}

async function submit(db: Db, userId: string, logId: string, paths = [path(userId)]) {
  const { rows } = await db.query<Event>(
    "select * from public.create_submission($1, $2, $3, $4, '固有値', '重解', 4)",
    [userId, logId, paths, path(userId, true)],
  );
  return rows[0];
}

async function judge(db: Db, submissionId: string, score: number, found = true) {
  const { rows } = await db.query<Event>("select * from public.record_judgement($1, $2, $3, '講評', 'test-model')", [
    submissionId,
    score,
    found,
  ]);
  return rows;
}

async function logStatus(db: Db, logId: string) {
  const { rows } = await db.query<{ status: string; dispute_window_ends_at: string | null }>(
    "select status, dispute_window_ends_at from public.study_logs where id = $1",
    [logId],
  );
  return rows[0];
}

describe("create_submission", () => {
  it("records the attempt and the time since declaring", async () => {
    const { db, aki, logId } = await setup();
    await setNow(db, "2026-10-20 13:12");
    const event = await submit(db, aki, logId);
    expect(event).toMatchObject({ type: "submitted", payload: { attempt_no: 1, elapsed_minutes: 252 } });
  });

  it("takes late-night submissions until the next day's 12:00 (ADR-032)", async () => {
    const { db, aki, logId } = await setup();
    await setNow(db, "2026-10-21 04:00");
    await expect(submit(db, aki, logId)).resolves.toMatchObject({ type: "submitted", payload: { elapsed_minutes: 1140 } });
  });

  it("is judged by submission time: refused from the deadline on", async () => {
    const { db, aki, logId } = await setup();
    await setNow(db, "2026-10-21 12:00");
    await expect(submit(db, aki, logId)).rejects.toThrow(/deadline_passed/);
  });

  it("only takes the owner's own paths for that day", async () => {
    const { db, aki, ben, logId } = await setup();
    await expect(submit(db, aki, logId, [path(ben)])).rejects.toThrow(/invalid_images/);
    await expect(submit(db, aki, logId, [`${aki}/2026-10-19/${randomUUID()}.webp`])).rejects.toThrow(/invalid_images/);
    await expect(submit(db, aki, logId, [path(aki), path(aki), path(aki), path(aki)])).rejects.toThrow(/invalid_images/);
    await expect(submit(db, ben, logId)).rejects.toThrow(/not_found/);
  });

  it("allows three attempts; Gemini errors don't count", async () => {
    const { db, aki, logId } = await setup();
    const first = await submit(db, aki, logId);
    await expect(submit(db, aki, logId)).rejects.toThrow(/judging_in_progress/);
    await db.query("select public.record_judge_error($1, 'rate limited')", [first.submission_id]);

    for (let i = 0; i < 3; i++) {
      const attempt = await submit(db, aki, logId);
      await judge(db, attempt.submission_id, 40);
    }
    await expect(submit(db, aki, logId)).rejects.toThrow(/no_attempts_left/);
  });
});

describe("record_judgement", () => {
  it("passes at the passing score with the passphrase, and opens the dispute window", async () => {
    const { db, aki, logId } = await setup();
    await setNow(db, "2026-10-20 13:00");
    const { submission_id: id } = await submit(db, aki, logId);
    const [event] = await judge(db, id, 70);
    expect(event).toMatchObject({ type: "judged_passed", payload: { score: 70 } });
    const log = await logStatus(db, logId);
    expect(log.status).toBe("passed");
    expect(new Date(log.dispute_window_ends_at!).toISOString()).toBe("2026-10-21T04:00:00.000Z"); // 24 hours after submitting
    await expect(submit(db, aki, logId)).rejects.toThrow(/already_passed/);
  });

  it("counts the dispute window from the submission, even when judged later", async () => {
    const { db, aki, logId } = await setup();
    await setNow(db, "2026-10-21 02:30");
    const { submission_id: id } = await submit(db, aki, logId);
    await db.query("select public.record_judge_error($1, 'rate limited')", [id]);
    await setNow(db, "2026-10-21 02:40");
    await judge(db, id, 90);
    const log = await logStatus(db, logId);
    expect(new Date(log.dispute_window_ends_at!).toISOString()).toBe("2026-10-21T17:30:00.000Z"); // 10-22 02:30 JST
  });

  it("rejects without the passphrase however high the score, and reports attempts left", async () => {
    const { db, aki, logId } = await setup();
    const { submission_id: id } = await submit(db, aki, logId);
    const [event] = await judge(db, id, 95, false);
    expect(event).toMatchObject({ type: "judged_rejected", payload: { attempts_left: 2 } });
    const { rows } = await db.query("select status, reject_reason from public.submissions where id = $1", [id]);
    expect(rows).toEqual([{ status: "rejected", reject_reason: "no_passphrase" }]);
    expect((await logStatus(db, logId)).status).toBe("pending");
  });

  it("judges a failed (error) submission again, once", async () => {
    const { db, aki, logId } = await setup();
    const { submission_id: id } = await submit(db, aki, logId);
    await db.query("select public.record_judge_error($1, 'timeout')", [id]);
    await judge(db, id, 80);
    await expect(judge(db, id, 80)).rejects.toThrow(/already_judged/);
  });

  it("waits while a rewrite is pending, and cancels if the rewrite expires", async () => {
    const { db, aki, ben, logId } = await setup();
    await db.query("select public.flag_declaration($1, $2, '軽い')", [ben, logId]);
    const { submission_id: id } = await submit(db, aki, logId);
    await expect(judge(db, id, 90)).rejects.toThrow(/revision_pending/);

    await setNow(db, "2026-10-20 10:01");
    await db.query("select * from public.expire_revisions()");
    const { rows } = await db.query("select status from public.submissions where id = $1", [id]);
    expect(rows).toEqual([{ status: "error" }]);
    await expect(judge(db, id, 90)).rejects.toThrow(/not_open/);
  });
});
