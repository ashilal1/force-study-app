import { describe, expect, it } from "vitest";
import { createMember, createTestDb, setNow, type Db } from "./harness";

// M4 rules: declarations (F3), passphrase (F4a), "too light" + rewrite (F3b), rest days (F2).
// Times are JST; 2026-10-20 is a Tuesday (its week is Sun 10-18 .. Sat 10-24).

type Event = { id: string; type: string; actor_id: string; study_log_id: string | null; payload: Record<string, unknown> };

async function declare(db: Db, userId: string, end = "15:00", text = "線形代数 3 章の演習 10 問") {
  const { rows } = await db.query<Event>("select * from public.declare_goal($1, $2, $3::time, 'さくら 47')", [
    userId,
    text,
    end,
  ]);
  return rows[0];
}

async function logOf(db: Db, id: string) {
  const { rows } = await db.query<Record<string, string | null>>("select * from public.study_logs where id = $1", [id]);
  return rows[0];
}

/** Two members out of their trial week, so penalties count. */
async function setup() {
  const db = await createTestDb();
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  const cho = await createMember(db, "cho");
  await db.query("update public.profiles set trial_ends_at = '2026-01-01'");
  return { db, aki, ben, cho };
}

describe("declare_goal", () => {
  it("records today's goal and passphrase, due at tomorrow's cutoff", async () => {
    const { db, aki } = await setup();
    await setNow(db, "2026-10-20 09:00");
    const event = await declare(db, aki);
    expect(event.type).toBe("declared");
    const log = await logOf(db, event.study_log_id!);
    expect(log).toMatchObject({ status: "pending", passphrase: "さくら 47" });
    // The chosen end time is ignored (ADR-032): due when the next declaration closes.
    expect(new Date(log.target_end_time!).toISOString()).toBe("2026-10-21T03:00:00.000Z");
    expect(String(log.date)).toContain("2026");
  });

  it("allows one declaration a day, before 12:00", async () => {
    const { db, aki, ben } = await setup();
    await setNow(db, "2026-10-20 11:59");
    await declare(db, aki);
    await expect(declare(db, aki)).rejects.toThrow(/already_declared/);
    await setNow(db, "2026-10-20 12:00");
    await expect(declare(db, ben)).rejects.toThrow(/declaration_closed/);
  });

  it("needs yesterday finished first: passed, or given up and the reason reported", async () => {
    const { db, aki } = await setup();
    await setNow(db, "2026-10-20 09:00");
    const { study_log_id: yesterday } = await declare(db, aki);

    // Studying late at night: still open the next morning, so today's declaration waits.
    await setNow(db, "2026-10-21 08:00");
    await expect(declare(db, aki)).rejects.toThrow(/previous_day_open/);

    const gaveUp = await db.query<Event>("select * from public.give_up_day($1, $2)", [aki, yesterday]);
    expect(gaveUp.rows[0]).toMatchObject({ type: "missed", payload: { gave_up: true } });
    expect(new Date(String(gaveUp.rows[0].payload.report_due_at)).toISOString()).toBe("2026-10-21T14:00:00.000Z");
    await expect(declare(db, aki)).rejects.toThrow(/previous_report_due/);

    await db.query("select * from public.file_failure_report($1, $2, 'slacked', null)", [aki, yesterday]);
    await expect(declare(db, aki)).resolves.toMatchObject({ type: "declared" });
  });

  it("lets only the owner give up an open day", async () => {
    const { db, aki, ben } = await setup();
    await setNow(db, "2026-10-20 09:00");
    const { study_log_id: logId } = await declare(db, aki);
    await expect(db.query("select public.give_up_day($1, $2)", [ben, logId])).rejects.toThrow(/not_found/);
    await db.query("select public.give_up_day($1, $2)", [aki, logId]);
    await expect(db.query("select public.give_up_day($1, $2)", [aki, logId])).rejects.toThrow(/not_open/);
    expect(await logOf(db, logId!)).toMatchObject({ status: "missed" });
  });

  it("is not needed (or allowed) on a rest day or on leave", async () => {
    const { db, aki, ben } = await setup();
    await db.query("insert into public.rest_days (user_id, date) values ($1, '2026-10-20')", [aki]);
    await db.query(
      `insert into public.leave_requests (user_id, start_date, end_date, reason, status, review_due_at, approved_at, resolved_at)
       values ($1, '2026-10-20', '2026-10-22', 'テスト期間なので休みます。三日間だけ集中したいので休会させてください', 'approved',
               '2026-10-19 23:59+09', '2026-10-19 20:00+09', '2026-10-19 20:00+09')`,
      [ben],
    );
    await setNow(db, "2026-10-20 09:00");
    await expect(declare(db, aki)).rejects.toThrow(/rest_day/);
    await expect(declare(db, ben)).rejects.toThrow(/on_leave/);
  });
});

describe("too light (flag_declaration / revise_declaration)", () => {
  it("starts a one-hour rewrite on the first flag, and lets others add to it", async () => {
    const { db, aki, ben, cho } = await setup();
    await setNow(db, "2026-10-20 09:00");
    const { study_log_id: logId } = await declare(db, aki);

    await setNow(db, "2026-10-20 10:00");
    await expect(db.query("select public.flag_declaration($1, $2, '自分で')", [aki, logId])).rejects.toThrow(/own_declaration/);
    const flagged = await db.query<Event>("select * from public.flag_declaration($1, $2, '10 問は少ない')", [ben, logId]);
    expect(flagged.rows[0]).toMatchObject({ type: "declaration_flagged", payload: { owner_id: aki } });
    await expect(db.query("select public.flag_declaration($1, $2, 'もう一度')", [ben, logId])).rejects.toThrow(/already_flagged/);

    await setNow(db, "2026-10-20 10:20");
    await db.query("select public.flag_declaration($1, $2, '同意')", [cho, logId]);
    const log = await logOf(db, logId!);
    expect(new Date(log.revision_due_at!).toISOString()).toBe("2026-10-20T02:00:00.000Z"); // 11:00 JST
  });

  it("closes flagging after three hours", async () => {
    const { db, aki, ben } = await setup();
    await setNow(db, "2026-10-20 09:00");
    const { study_log_id: logId } = await declare(db, aki, "20:00");
    await setNow(db, "2026-10-20 12:01");
    await expect(db.query("select public.flag_declaration($1, $2, '軽い')", [ben, logId])).rejects.toThrow(/flag_closed/);
  });

  it("keeps the original when rewritten, and closes further flags", async () => {
    const { db, aki, ben, cho } = await setup();
    await setNow(db, "2026-10-20 09:00");
    const { study_log_id: logId } = await declare(db, aki);
    await setNow(db, "2026-10-20 09:30");
    await db.query("select public.flag_declaration($1, $2, '軽い')", [ben, logId]);

    await setNow(db, "2026-10-20 10:00");
    const revised = await db.query<Event>("select * from public.revise_declaration($1, $2, '演習 30 問と章末問題')", [aki, logId]);
    expect(revised.rows[0].type).toBe("declaration_revised");
    expect(await logOf(db, logId!)).toMatchObject({
      declaration: "演習 30 問と章末問題",
      original_declaration: "線形代数 3 章の演習 10 問",
      passphrase: "さくら 47",
    });
    await expect(db.query("select public.flag_declaration($1, $2, 'まだ軽い')", [cho, logId])).rejects.toThrow(/already_revised/);
    await expect(db.query("select public.revise_declaration($1, $2, '別の宣言')", [aki, logId])).rejects.toThrow(
      /no_revision_needed/,
    );
  });

  it("does not accept a rewrite after the deadline", async () => {
    const { db, aki, ben } = await setup();
    await setNow(db, "2026-10-20 09:00");
    const { study_log_id: logId } = await declare(db, aki);
    await db.query("select public.flag_declaration($1, $2, '軽い')", [ben, logId]);
    await setNow(db, "2026-10-20 10:01");
    await expect(db.query("select public.revise_declaration($1, $2, '書き直し')", [aki, logId])).rejects.toThrow(
      /revision_expired/,
    );
  });
});

describe("expire_revisions", () => {
  it("reminds 15 minutes before, then turns an unrevised declaration into P6 once", async () => {
    const { db, aki, ben } = await setup();
    await setNow(db, "2026-10-20 09:00");
    const { study_log_id: logId } = await declare(db, aki);
    await db.query("select public.flag_declaration($1, $2, '軽い')", [ben, logId]);

    await setNow(db, "2026-10-20 09:50");
    const reminders = await db.query<Event>("select * from public.expire_revisions()");
    expect(reminders.rows.map((e) => e.type)).toEqual(["reminder_revision_due"]);
    expect((await db.query("select * from public.expire_revisions()")).rows).toHaveLength(0);

    await setNow(db, "2026-10-20 10:01");
    const expired = await db.query<Event>("select * from public.expire_revisions()");
    expect(expired.rows.map((e) => e.type)).toEqual(["revision_expired"]);
    expect(expired.rows[0].payload).toMatchObject({ points: 500, waived: null });
    expect((await logOf(db, logId!)).status).toBe("no_declaration");
    const penalties = await db.query("select reason, points from public.penalties");
    expect(penalties.rows).toEqual([{ reason: "unrevised", points: 500 }]);

    expect((await db.query("select * from public.expire_revisions()")).rows).toHaveLength(0);
  });

  it("records but waives the penalty during the trial week", async () => {
    const { db, aki, ben } = await setup();
    await db.query("update public.profiles set trial_ends_at = '2026-10-25 00:00+09' where id = $1", [aki]);
    await setNow(db, "2026-10-20 09:00");
    const { study_log_id: logId } = await declare(db, aki);
    await db.query("select public.flag_declaration($1, $2, '軽い')", [ben, logId]);
    await setNow(db, "2026-10-20 11:00");
    await db.query("select * from public.expire_revisions()");
    const { rows } = await db.query("select waived from public.penalties");
    expect(rows).toEqual([{ waived: "trial" }]);
  });
});

describe("rest days", () => {
  it("can be registered from tomorrow on, one per Sunday-Saturday week", async () => {
    const { db, aki } = await setup();
    await setNow(db, "2026-10-20 09:00");
    await expect(db.query("select public.register_rest_day($1, '2026-10-20')", [aki])).rejects.toThrow(/rest_day_too_soon/);
    await db.query("select public.register_rest_day($1, '2026-10-21')", [aki]);
    await expect(db.query("select public.register_rest_day($1, '2026-10-24')", [aki])).rejects.toThrow(/rest_day_limit/);
    await db.query("select public.register_rest_day($1, '2026-10-25')", [aki]); // next week (Sunday)
  });

  it("can be cancelled until the day before", async () => {
    const { db, aki } = await setup();
    await setNow(db, "2026-10-20 09:00");
    await db.query("select public.register_rest_day($1, '2026-10-21')", [aki]);
    await db.query("select public.cancel_rest_day($1, '2026-10-21')", [aki]);
    await db.query("select public.register_rest_day($1, '2026-10-22')", [aki]);
    await setNow(db, "2026-10-22 08:00");
    await expect(db.query("select public.cancel_rest_day($1, '2026-10-22')", [aki])).rejects.toThrow(/rest_day_locked/);
  });
});
