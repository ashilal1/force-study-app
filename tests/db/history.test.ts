import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asUser, createMember, createTestDb, setNow, type Db } from "./harness";

// M8b: retrospective views. They use now() for "today", so the data is built in the past
// (pinned clock) and read relative to the real date.

async function setup() {
  const db = await createTestDb();
  await setNow(db, "2026-10-01 09:00");
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  await db.query("update public.profiles set trial_ends_at = '2026-01-01', created_at = '2026-10-18 08:00+09'::timestamptz + (created_at - (select min(created_at) from public.profiles))");
  return { db, aki, ben };
}

async function declare(db: Db, userId: string, date: string) {
  await setNow(db, `${date} 09:00`);
  const { rows } = await db.query<{ study_log_id: string }>(
    "select study_log_id from public.declare_goal($1, '演習', '15:00'::time, 'さくら 47')",
    [userId],
  );
  return rows[0].study_log_id;
}

async function pass(db: Db, userId: string, logId: string, date: string, score: number) {
  await setNow(db, `${date} 13:00`);
  const sub = await db.query<{ submission_id: string }>(
    "select submission_id from public.create_submission($1, $2, $3, null, 'a', 'b', 3)",
    [userId, logId, [`${userId}/${date}/${randomUUID()}.webp`]],
  );
  await db.query("select public.record_judgement($1, $2, true, 'ok', 'test')", [sub.rows[0].submission_id, score]);
  // 「怪しい」 stays open 24 hours (ADR-032).
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  await setNow(db, `${next.toISOString().slice(0, 10)} 13:30`);
  await db.query("select * from public.confirm_passed_logs()");
}

describe("daily_history and weekly_stats", () => {
  it("has one row per day since joining, classifying each day", async () => {
    const { db, aki, ben } = await setup();
    // Sun 10-18: aki completes (85). Mon 10-19: aki misses. Tue 10-20: rest. Wed 10-21: no declaration.
    await pass(db, aki, await declare(db, aki, "2026-10-18"), "2026-10-18", 85);
    const missed = await declare(db, aki, "2026-10-19");
    await setNow(db, "2026-10-19 15:05");
    await db.query("select * from public.give_up_day($1, $2)", [aki, missed]);
    await db.query("insert into public.rest_days (user_id, date) values ($1, '2026-10-20')", [aki]);
    await setNow(db, "2026-10-21 12:05");
    await db.query("select * from public.close_declarations()");

    const days = await asUser(db, ben, async (tx) =>
      (
        await tx.query<{ date: string; kind: string; final_score: number | null; penalty_points: number }>(
          "select date::text, kind, final_score, penalty_points from public.daily_history where user_id = $1 and date <= '2026-10-21' order by date",
          [aki],
        )
      ).rows,
    );
    expect(days).toEqual([
      { date: "2026-10-18", kind: "completed", final_score: 85, penalty_points: 0 },
      { date: "2026-10-19", kind: "missed", final_score: null, penalty_points: 0 },
      { date: "2026-10-20", kind: "rest", final_score: null, penalty_points: 0 },
      { date: "2026-10-21", kind: "no_declaration", final_score: null, penalty_points: 500 },
    ]);

    const week = await asUser(db, ben, async (tx) =>
      (
        await tx.query(
          "select week_end::text, counted_days, completed_days, achievement_rate, avg_score, penalty_points from public.weekly_stats where user_id = $1 and week_end = '2026-10-24'",
          [aki],
        )
      ).rows,
    );
    // 10-22 .. 10-24 have no record yet in this pinned history ("none"), so they don't count.
    expect(week).toEqual([
      { week_end: "2026-10-24", counted_days: 3, completed_days: 1, achievement_rate: 33, avg_score: 85, penalty_points: 500 },
    ]);
  });
});

describe("received_objections", () => {
  it("collects flags, rejections and AI rejections for the member who received them", async () => {
    const { db, aki, ben } = await setup();
    const logId = await declare(db, aki, "2026-10-19");
    await setNow(db, "2026-10-19 10:00");
    await db.query("select public.flag_declaration($1, $2, '軽い')", [ben, logId]);
    await db.query("select public.revise_declaration($1, $2, '演習 30 問')", [aki, logId]);
    await setNow(db, "2026-10-19 13:00");
    const sub = await db.query<{ submission_id: string }>(
      "select submission_id from public.create_submission($1, $2, $3, null, 'a', 'b', 3)",
      [aki, logId, [`${aki}/2026-10-19/${randomUUID()}.webp`]],
    );
    await db.query("select public.record_judgement($1, 40, true, '量が足りない', 'test')", [sub.rows[0].submission_id]);

    const rows = await asUser(db, ben, async (tx) =>
      (
        await tx.query<{ kind: string; by_user_id: string | null; reason: string }>(
          "select kind, by_user_id, reason from public.received_objections where user_id = $1 order by occurred_at",
          [aki],
        )
      ).rows,
    );
    expect(rows).toEqual([
      { kind: "too_light", by_user_id: ben, reason: "軽い" },
      { kind: "ai_rejected", by_user_id: null, reason: "量が足りない" },
    ]);
  });
});
