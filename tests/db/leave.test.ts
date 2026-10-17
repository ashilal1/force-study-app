import { describe, expect, it } from "vitest";
import { createMember, createTestDb, setNow, type Db } from "./harness";

// Leave (F2b): everyone else approves, one reject or the 23:59 deadline ends it. Times are JST.

const REASON = "期末テストが続くので一週間まとめて休会させてください。終わったらすぐ戻ります";

type Event = { type: string; leave_request_id: string; payload: Record<string, unknown> };

async function request(db: Db, userId: string, start = "2026-10-22", end = "2026-10-28", reason = REASON) {
  const { rows } = await db.query<Event>("select * from public.request_leave($1, $2::date, $3::date, $4)", [
    userId,
    start,
    end,
    reason,
  ]);
  return rows;
}

async function vote(db: Db, reviewerId: string, leaveId: string, verdict: "accept" | "reject") {
  const { rows } = await db.query<Event>("select * from public.cast_review($1, 'leave', $2, $3, null)", [
    reviewerId,
    leaveId,
    verdict,
  ]);
  return rows.map((e) => e.type);
}

async function onLeave(db: Db, userId: string, date: string) {
  const { rows } = await db.query<{ on: boolean }>("select private.is_on_leave($1, $2::date) as on", [userId, date]);
  return rows[0].on;
}

async function setup() {
  const db = await createTestDb();
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  const cho = await createMember(db, "cho");
  await setNow(db, "2026-10-20 10:00");
  return { db, aki, ben, cho };
}

describe("request_leave", () => {
  it("asks every other member, and needs a long enough reason and a future start", async () => {
    const { db, aki, ben, cho } = await setup();
    await expect(request(db, aki, "2026-10-20")).rejects.toThrow(/leave_too_soon/);
    await expect(request(db, aki, "2026-10-22", "2026-10-28", "旅行")).rejects.toThrow(/reason_too_short/);

    const [event] = await request(db, aki);
    expect(event.type).toBe("leave_requested");
    expect(event.payload.reviewer_ids).toEqual([ben, cho]);
    await expect(request(db, aki, "2026-10-25", "2026-10-30")).rejects.toThrow(/leave_overlaps/);
  });

  it("is approved for a member with nobody to ask", async () => {
    const db = await createTestDb();
    const solo = await createMember(db, "solo");
    await setNow(db, "2026-10-20 10:00");
    const events = await request(db, solo);
    expect(events.map((e) => e.type)).toEqual(["leave_requested", "leave_approved"]);
  });
});

describe("cast_review (leave)", () => {
  it("approves when everyone accepts; days count from the next morning", async () => {
    const { db, aki, ben, cho } = await setup();
    const [{ leave_request_id: id }] = await request(db, aki);
    expect(await vote(db, ben, id, "accept")).toEqual(["review_vote_cast"]);
    expect(await vote(db, cho, id, "accept")).toEqual(["review_vote_cast", "leave_approved"]);
    expect(await onLeave(db, aki, "2026-10-22")).toBe(true);
    expect(await onLeave(db, aki, "2026-10-29")).toBe(false);
  });

  it("rejects on the first reject, and checks who may vote", async () => {
    const { db, aki, ben, cho } = await setup();
    const [{ leave_request_id: id }] = await request(db, aki);
    await expect(vote(db, aki, id, "accept")).rejects.toThrow(/not_a_reviewer/);
    expect(await vote(db, ben, id, "reject")).toEqual(["review_vote_cast", "leave_rejected"]);
    await expect(vote(db, ben, id, "accept")).rejects.toThrow(/already_reviewed/);
    await expect(vote(db, cho, id, "accept")).rejects.toThrow(/review_closed/);
  });

  it("lapses at 23:59 of the day it was asked", async () => {
    const { db, aki, ben } = await setup();
    const [{ leave_request_id: id }] = await request(db, aki);
    await vote(db, ben, id, "accept");
    await setNow(db, "2026-10-20 23:58");
    expect((await db.query("select * from public.expire_reviews()")).rows).toHaveLength(0);
    await setNow(db, "2026-10-21 00:00:30");
    const expired = await db.query<Event>("select * from public.expire_reviews()");
    expect(expired.rows.map((e) => e.type)).toEqual(["leave_rejected"]);
    expect((await db.query("select * from public.expire_reviews()")).rows).toHaveLength(0);
  });

  it("counts a day approved the evening before", async () => {
    const { db, aki, ben, cho } = await setup();
    const [{ leave_request_id: id }] = await request(db, aki, "2026-10-21", "2026-10-23");
    await vote(db, ben, id, "accept");
    await setNow(db, "2026-10-20 23:00");
    await vote(db, cho, id, "accept");
    expect(await onLeave(db, aki, "2026-10-20")).toBe(false);
    expect(await onLeave(db, aki, "2026-10-21")).toBe(true);
  });
});

describe("cancel_leave", () => {
  it("ends an approved leave from tomorrow", async () => {
    const { db, aki, ben, cho } = await setup();
    const [{ leave_request_id: id }] = await request(db, aki);
    await vote(db, ben, id, "accept");
    await vote(db, cho, id, "accept");

    await setNow(db, "2026-10-24 09:00");
    await db.query("select public.cancel_leave($1, $2)", [aki, id]);
    expect(await onLeave(db, aki, "2026-10-24")).toBe(true);
    expect(await onLeave(db, aki, "2026-10-25")).toBe(false);
    await expect(db.query("select public.cancel_leave($1, $2)", [aki, id])).rejects.toThrow(/leave_closed/);
  });

  it("withdraws a request under review", async () => {
    const { db, aki, ben } = await setup();
    const [{ leave_request_id: id }] = await request(db, aki);
    await db.query("select public.cancel_leave($1, $2)", [aki, id]);
    await expect(vote(db, ben, id, "accept")).rejects.toThrow(/review_closed/);
  });
});
