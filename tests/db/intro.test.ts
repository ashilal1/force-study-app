import { describe, expect, it } from "vitest";
import { asUser, createMember, createTestDb, type Db } from "./harness";

// The first-time experience (F15): agreeing to the rules after the intro lecture, and the coach
// marks seen.

async function profile(db: Db, id: string) {
  const { rows } = await db.query<{ rules_accepted_at: string | null; seen_tips: string[] }>(
    "select rules_accepted_at, seen_tips from public.profiles where id = $1",
    [id],
  );
  return rows[0];
}

describe("accept_rules", () => {
  it("starts new members unagreed and keeps the first agreement", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    expect(await profile(db, me)).toEqual({ rules_accepted_at: null, seen_tips: [] });

    const first = (await db.query<{ at: string }>("select public.accept_rules($1) as at", [me])).rows[0].at;
    expect(first).not.toBeNull();
    const again = (await db.query<{ at: string }>("select public.accept_rules($1) as at", [me])).rows[0].at;
    expect(again).toEqual(first);
  });

  it("refuses someone who is not a member", async () => {
    const db = await createTestDb();
    await expect(db.query("select public.accept_rules(gen_random_uuid())")).rejects.toThrow(/not_a_member/);
  });

  it("isn't callable from the browser", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    await expect(asUser(db, me, (tx) => tx.query("select public.accept_rules($1)", [me]))).rejects.toThrow(/permission denied/);
  });
});

describe("coach marks", () => {
  it("remembers each key once and resets", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    await db.query("select public.mark_tip_seen($1, 'passphrase')", [me]);
    await db.query("select public.mark_tip_seen($1, 'passphrase')", [me]);
    await db.query("select public.mark_tip_seen($1, 'home_todo')", [me]);
    expect((await profile(db, me)).seen_tips).toEqual(["passphrase", "home_todo"]);

    await db.query("select public.reset_tips($1)", [me]);
    expect((await profile(db, me)).seen_tips).toEqual([]);
  });

  it("checks the key's shape", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    for (const bad of ["", "Passphrase", "a-b", "x".repeat(41), "*"]) {
      await expect(db.query("select public.mark_tip_seen($1, $2)", [me, bad])).rejects.toThrow(/invalid_tip/);
    }
  });

  it("starts a second membership of the same account with every coach mark seen", async () => {
    const db = await createTestDb();
    const aki = await createMember(db, "aki");
    const ben = await createMember(db, "ben");
    const account = (await db.query<{ a: string }>("select auth_user_id as a from public.profiles where id = $1", [ben])).rows[0].a;
    await db.query("select * from public.leave_group($1)", [ben]);
    const fresh = (await db.query<{ id: string }>("select id from public.create_group($1, 'ben', null, 'ベンの会')", [account])).rows[0].id;

    expect(await profile(db, fresh)).toEqual({ rules_accepted_at: null, seen_tips: ["*"] });
    expect((await profile(db, aki)).seen_tips).toEqual([]);
    // '*' already covers every key.
    await db.query("select public.mark_tip_seen($1, 'passphrase')", [fresh]);
    expect((await profile(db, fresh)).seen_tips).toEqual(["*"]);
  });
});
