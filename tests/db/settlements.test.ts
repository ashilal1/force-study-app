import { describe, expect, it } from "vitest";
import { asUser, createMember, createTestDb, setNow, type Db } from "./harness";

// M7b: weekly settlement (F8, P7). Week = Sunday 10-18 .. Saturday 10-24; settles 10-24 23:59.

type Event = { type: string; actor_id: string | null; settlement_id: string | null; payload: Record<string, unknown> };
type Settlement = { id: string; debtor_id: string; payee_id: string; period_end: string; amount_yen: number; status: string };

async function setup() {
  const db = await createTestDb();
  await setNow(db, "2026-10-01 09:00");
  const aki = await createMember(db, "aki"); // admin
  const ben = await createMember(db, "ben");
  const cho = await createMember(db, "cho");
  await db.query("update public.profiles set trial_ends_at = '2026-01-01', created_at = '2026-10-01'::timestamptz + (created_at - (select min(created_at) from public.profiles))");
  return { db, aki, ben, cho };
}

/** A day without a declaration (P1, 500) for `userId` on `date`. */
async function p1(db: Db, date: string, rest: string[] = []) {
  for (const user of rest) await db.query("insert into public.rest_days (user_id, date) values ($1, $2)", [user, date]);
  await setNow(db, `${date} 12:05`);
  await db.query("select * from public.close_declarations()");
}

const assign = (db: Db, admin: string, user: string, payee: string) =>
  db.query<Event>("select * from public.assign_payee($1, $2, $3)", [admin, user, payee]);

const settle = async (db: Db, when: string) => {
  await setNow(db, when);
  return (await db.query<Event>("select * from public.run_weekly_settlement()")).rows;
};

const settlements = async (db: Db) =>
  (await db.query<Settlement>("select id, debtor_id, payee_id, period_end::text, amount_yen, status from public.settlements order by debtor_id")).rows;

describe("assign_payee", () => {
  it("is admin-only and refuses yourself or the same payee", async () => {
    const { db, aki, ben, cho } = await setup();
    await expect(assign(db, ben, cho, aki)).rejects.toThrow(/not_admin/);
    await expect(assign(db, aki, ben, ben)).rejects.toThrow(/invalid_payee/);
    const { rows } = await assign(db, aki, ben, cho);
    expect(rows[0]).toMatchObject({ type: "payee_assigned", payload: { user_id: ben, payee_id: cho, previous_payee_id: null } });
    await expect(assign(db, aki, ben, cho)).rejects.toThrow(/unchanged/);
  });
});

describe("run_weekly_settlement", () => {
  it("bundles the week's penalties per member to their payee at Saturday 23:59, once", async () => {
    const { db, aki, ben, cho } = await setup();
    await assign(db, aki, aki, ben);
    await assign(db, aki, ben, cho);
    await assign(db, aki, cho, aki);
    await p1(db, "2026-10-20", [cho]); // aki, ben: 500
    await p1(db, "2026-10-22", [ben, cho]); // aki: 500

    expect(await settle(db, "2026-10-24 23:58")).toEqual([]);
    const events = await settle(db, "2026-10-25 00:02");
    expect(events.map((e) => e.type).sort()).toEqual(["settlement_created", "settlement_created", "weekly_summary"]);
    expect((await settlements(db)).map((s) => [s.debtor_id, s.payee_id, s.period_end, s.amount_yen]).sort()).toEqual(
      [
        [aki, ben, "2026-10-24", 1000],
        [ben, cho, "2026-10-24", 500],
      ].sort(),
    );
    expect(await settle(db, "2026-10-25 00:07")).toEqual([]);
    const { rows } = await db.query("select count(*)::int as n from public.penalties where settlement_id is null");
    expect(rows).toEqual([{ n: 0 }]);
  });

  it("skips trial penalties and keeps members without a payee for later, telling the admins", async () => {
    const { db, aki, ben, cho } = await setup();
    await db.query("update public.profiles set trial_ends_at = '2026-10-25 00:00+09' where id = $1", [cho]);
    await assign(db, aki, aki, ben);
    await p1(db, "2026-10-20"); // everyone: aki paid, ben has no payee, cho in trial
    const events = await settle(db, "2026-10-25 00:02");
    expect(events.filter((e) => e.type === "payee_missing").map((e) => [e.actor_id, e.payload.admin_ids])).toEqual([
      [ben, [aki]],
    ]);
    expect((await settlements(db)).map((s) => s.debtor_id)).toEqual([aki]);

    await assign(db, aki, ben, aki);
    await settle(db, "2026-11-01 00:02");
    expect((await settlements(db)).find((s) => s.debtor_id === ben)).toMatchObject({ period_end: "2026-10-31", amount_yen: 500 });
  });
});

describe("paying", () => {
  async function owing() {
    const ctx = await setup();
    await assign(ctx.db, ctx.aki, ctx.aki, ctx.ben);
    await p1(ctx.db, "2026-10-20", [ctx.ben, ctx.cho]);
    await settle(ctx.db, "2026-10-25 00:02");
    const [settlement] = await settlements(ctx.db);
    return { ...ctx, settlement };
  }

  it("goes 送金した -> 受け取った, and 届いていない sends it back", async () => {
    const { db, aki, ben, cho, settlement } = await owing();
    await expect(db.query("select public.mark_settlement_sent($1, $2)", [ben, settlement.id])).rejects.toThrow(/not_found/);
    await db.query("select public.mark_settlement_sent($1, $2)", [aki, settlement.id]);
    await expect(db.query("select public.confirm_settlement($1, $2)", [cho, settlement.id])).rejects.toThrow(/not_found/);
    await db.query("select public.report_not_received($1, $2)", [ben, settlement.id]);
    expect((await settlements(db))[0].status).toBe("open");
    await db.query("select public.mark_settlement_sent($1, $2)", [aki, settlement.id]);
    await db.query("select public.confirm_settlement($1, $2)", [ben, settlement.id]);
    expect((await settlements(db))[0].status).toBe("completed");
  });

  it("adds P7 every week a settlement stays open, into the next settlement", async () => {
    const { db, aki, settlement } = await owing();
    await setNow(db, "2026-10-31 00:30");
    expect((await db.query<Event>("select * from public.late_payment_reminders()")).rows.map((e) => e.type)).toEqual([
      "reminder_late_payment",
    ]);

    const week2 = await settle(db, "2026-11-01 00:02");
    expect(week2.filter((e) => e.type === "late_payment").map((e) => [e.actor_id, e.settlement_id])).toEqual([
      [aki, settlement.id],
    ]);
    const all = await settlements(db);
    expect(all.find((s) => s.period_end === "2026-10-31")).toMatchObject({ debtor_id: aki, amount_yen: 500 });

    await settle(db, "2026-11-08 00:02");
    const { rows } = await db.query("select count(*)::int as n from public.penalties where reason = 'late_payment'");
    expect(rows).toEqual([{ n: 3 }]); // the first one twice, plus the second week's own settlement
  });

  it("stops P7 once marked sent", async () => {
    const { db, aki, settlement } = await owing();
    await db.query("select public.mark_settlement_sent($1, $2)", [aki, settlement.id]);
    const week2 = await settle(db, "2026-11-01 00:02");
    expect(week2.filter((e) => e.type === "late_payment")).toEqual([]);
  });
});

describe("penalty_summary", () => {
  it("shows totals, this week, trial points and the 奢り確定 settlement through RLS", async () => {
    const { db, aki, ben } = await setup();
    await assign(db, aki, aki, ben);
    await p1(db, "2026-10-20", [ben]);
    const before = await asUser(db, ben, async (tx) =>
      (await tx.query("select user_id, total_points, unsettled_points, open_settlement_id is not null as owes from public.penalty_summary where user_id = $1", [aki])).rows,
    );
    expect(before).toEqual([{ user_id: aki, total_points: 500, unsettled_points: 500, owes: false }]);
    await settle(db, "2026-10-25 00:02");
    const after = await asUser(db, ben, async (tx) =>
      (await tx.query("select unsettled_points, open_settlement_id is not null as owes from public.penalty_summary where user_id = $1", [aki])).rows,
    );
    expect(after).toEqual([{ unsettled_points: 0, owes: true }]);
  });
});
