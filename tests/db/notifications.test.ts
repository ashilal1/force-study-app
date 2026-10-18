import { describe, expect, it } from "vitest";
import { asUser, createAuthUser, createMember, createTestDb, type Db } from "./harness";

// Notification pipeline RPCs (M3). Recipients and wording are decided in lib/notify; the database
// records them, keeps them idempotent and keeps devices per member.

const ENDPOINT = "https://push.example.com/send/abc";

async function save(db: Db, userId: string, endpoint = ENDPOINT, keys = { p256dh: "p1", auth: "a1" }) {
  const { rows } = await db.query<{ id: string; user_id: string; verified_at: string | null }>(
    "select id, user_id, verified_at from public.save_push_subscription($1, $2, $3, $4, 'Test UA')",
    [userId, endpoint, keys.p256dh, keys.auth],
  );
  return rows[0];
}

async function confirm(db: Db, userId: string, endpoint = ENDPOINT) {
  return db.query("select public.confirm_push_subscription($1, $2)", [userId, endpoint]);
}

async function anEvent(db: Db, actorId: string) {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.activity_events (type, actor_id) values ('member_joined', $1) returning id",
    [actorId],
  );
  return rows[0].id;
}

describe("push subscriptions", () => {
  it("registers a device for a member and confirms it", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    const saved = await save(db, me);
    expect(saved.verified_at).toBeNull();

    await confirm(db, me);
    const { rows } = await db.query<{ device: string | null; profile: string | null }>(
      `select s.verified_at as device, p.notifications_verified_at as profile
       from public.push_subscriptions s join public.profiles p on p.id = s.user_id`,
    );
    expect(rows[0].device).not.toBeNull();
    expect(rows[0].profile).not.toBeNull();
  });

  it("keeps the confirmation when the same device registers again", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    await save(db, me);
    await confirm(db, me);
    expect((await save(db, me)).verified_at).not.toBeNull();
  });

  it("asks again when the keys change or another account takes the device over", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    const friend = await createMember(db, "ben");
    await save(db, me);
    await confirm(db, me);

    expect((await save(db, me, ENDPOINT, { p256dh: "p2", auth: "a2" })).verified_at).toBeNull();
    await confirm(db, me);

    const takenOver = await save(db, friend, ENDPOINT, { p256dh: "p2", auth: "a2" });
    expect(takenOver).toMatchObject({ user_id: friend, verified_at: null });
    await expect(confirm(db, me)).rejects.toThrow(/unknown_subscription/);
  });

  it("rejects non-members and non-https endpoints", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    const outsider = await createAuthUser(db, "x@example.com");
    await expect(save(db, outsider)).rejects.toThrow(/not_a_member/);
    await expect(save(db, me, "http://push.example.com/x")).rejects.toThrow(/invalid_endpoint/);
  });

  it("deletes only the owner's device unless the push service said it is gone", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    const friend = await createMember(db, "ben");
    await save(db, me);

    await db.query("select public.delete_push_subscription($1, $2)", [ENDPOINT, friend]);
    expect((await db.query("select 1 from public.push_subscriptions")).rows).toHaveLength(1);
    await db.query("select public.delete_push_subscription($1)", [ENDPOINT]);
    expect((await db.query("select 1 from public.push_subscriptions")).rows).toHaveLength(0);
  });

  it("is readable only by its owner and writable only through the server", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    const friend = await createMember(db, "ben");
    await save(db, me);

    const seen = await asUser(db, friend, async (tx) => (await tx.query("select * from public.push_subscriptions")).rows);
    expect(seen).toHaveLength(0);
    const mine = await asUser(db, me, async (tx) => (await tx.query("select * from public.push_subscriptions")).rows);
    expect(mine).toHaveLength(1);
    await expect(
      asUser(db, me, (tx) => tx.query("select public.save_push_subscription($1, 'https://x', 'p', 'a', null)", [me])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("create_notifications", () => {
  it("creates one row per active recipient, once", async () => {
    const db = await createTestDb();
    const aki = await createMember(db, "aki");
    const ben = await createMember(db, "ben");
    const gone = await createMember(db, "gone");
    await db.query("update public.profiles set deactivated_at = now(), left_reason = 'removed' where id = $1", [gone]);
    const event = await anEvent(db, aki);
    const items = JSON.stringify(
      [ben, gone].map((id) => ({ recipient_id: id, title: "aki が参加しました", url: "/", requires_action: false })),
    );

    const first = await db.query<{ recipient_id: string; body: string }>(
      "select recipient_id, body from public.create_notifications($1, $2::jsonb)",
      [event, items],
    );
    expect(first.rows).toEqual([{ recipient_id: ben, body: "" }]);

    const retry = await db.query("select * from public.create_notifications($1, $2::jsonb)", [event, items]);
    expect(retry.rows).toHaveLength(0);
  });

  it("marks pushed once", async () => {
    const db = await createTestDb();
    const aki = await createMember(db, "aki");
    const ben = await createMember(db, "ben");
    const event = await anEvent(db, aki);
    const { rows } = await db.query<{ id: string }>(
      "select id from public.create_notifications($1, $2::jsonb)",
      [event, JSON.stringify([{ recipient_id: ben, title: "t" }])],
    );
    await db.query("select public.mark_notifications_pushed($1)", [[rows[0].id]]);
    const first = await db.query<{ pushed_at: string }>("select pushed_at from public.notifications");
    await db.query("select public.mark_notifications_pushed($1)", [[rows[0].id]]);
    const second = await db.query<{ pushed_at: string }>("select pushed_at from public.notifications");
    expect(second.rows[0].pushed_at).toEqual(first.rows[0].pushed_at);
  });

  it("lets recipients read and mark only their own notifications", async () => {
    const db = await createTestDb();
    const aki = await createMember(db, "aki");
    const ben = await createMember(db, "ben");
    const event = await anEvent(db, aki);
    await db.query("select public.create_notifications($1, $2::jsonb)", [
      event,
      JSON.stringify([{ recipient_id: ben, title: "t" }]),
    ]);

    expect(await asUser(db, aki, async (tx) => (await tx.query("select * from public.notifications")).rows)).toHaveLength(0);
    const marked = await asUser(db, ben, async (tx) => {
      await tx.query("update public.notifications set read_at = now()");
      return (await tx.query<{ read_at: string | null }>("select read_at from public.notifications")).rows[0].read_at;
    });
    expect(marked).not.toBeNull();
    await expect(
      asUser(db, ben, (tx) => tx.query("update public.notifications set title = 'x'")),
    ).rejects.toThrow(/permission denied/);
  });
});
