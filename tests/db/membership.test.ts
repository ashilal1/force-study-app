import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createAuthUser, createMember, createTestDb, type Db } from "./harness";

describe("membership (ADR-025)", () => {
  let db: Db;
  let first: string;
  let second: string;
  let outsider: string;

  beforeAll(async () => {
    db = await createTestDb();
    first = await createMember(db, "aki");
    second = await createMember(db, "ben");
    outsider = await createAuthUser(db, "stranger@example.com");
  });

  it("makes the first member admin and nobody else", async () => {
    const { rows } = await db.query<{ id: string; is_admin: boolean }>(
      "select id, is_admin from public.profiles order by created_at",
    );
    expect(rows).toEqual([
      { id: first, is_admin: true },
      { id: second, is_admin: false },
    ]);
  });

  it("join_group is idempotent", async () => {
    const account = (await db.query<{ a: string }>("select auth_user_id as a from public.profiles where id = $1", [first])).rows[0].a;
    await db.query("select public.join_group($1, 'aki again', null, null, true)", [account]);
    const { rows } = await db.query<{ display_name: string }>(
      "select display_name from public.profiles where id = $1",
      [first],
    );
    expect(rows[0].display_name).toBe("aki");
  });

  it("hides everything from a signed-in user who has not joined", async () => {
    const counts = await asUser(db, outsider, async (tx) => {
      const settings = await tx.query("select * from public.group_settings");
      const profiles = await tx.query("select * from public.profiles");
      return [settings.rows.length, profiles.rows.length];
    });
    expect(counts).toEqual([0, 0]);
  });

  it("shows group data to members", async () => {
    const count = await asUser(db, second, async (tx) => (await tx.query("select * from public.profiles")).rows.length);
    expect(count).toBe(2);
  });

  it("does not let users call join_group themselves", async () => {
    await expect(
      asUser(db, outsider, (tx) => tx.query("select public.join_group($1, 'sneaky', null, null, true)", [outsider])),
    ).rejects.toThrow(/permission denied/);
  });

  it("does not let a deactivated member read anything", async () => {
    const account = (await db.query<{ a: string }>("select auth_user_id as a from public.profiles where id = $1", [second])).rows[0].a;
    const count = await asService(db, async (tx) => {
      await tx.query("update public.profiles set deactivated_at = now(), left_reason = 'removed' where id = $1", [second]);
      await tx.exec("reset role");
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [account]);
      return (await tx.query("select * from public.profiles")).rows.length;
    });
    expect(count).toBe(0);
  });
});

describe("trial period", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it.each([
    ["2026-10-12 10:00+09", "2026-10-18 00:00:00+09"], // Monday -> next Sunday
    ["2026-10-17 23:00+09", "2026-10-18 00:00:00+09"], // Saturday -> next day
    ["2026-10-18 09:00+09", "2026-10-25 00:00:00+09"], // Sunday -> following Sunday
  ])("signing up at %s ends the trial at %s", async (signup, expected) => {
    const { rows } = await db.query<{ ends: string }>(
      "select to_char(private.trial_end_for($1::timestamptz) at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI:SS') || '+09' as ends",
      [signup],
    );
    expect(rows[0].ends).toBe(expected);
  });
});
