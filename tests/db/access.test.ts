import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createMember, createTestDb, type Db } from "./harness";

describe("writes go through the server (ADR-004)", () => {
  let db: Db;
  let me: string;
  let friend: string;

  beforeAll(async () => {
    db = await createTestDb();
    me = await createMember(db, "aki");
    friend = await createMember(db, "ben");
  });

  it("lets a member edit their own display name", async () => {
    const name = await asUser(db, me, async (tx) => {
      await tx.query("update public.profiles set display_name = 'Aki' where id = $1", [me]);
      return (await tx.query<{ display_name: string }>("select display_name from public.profiles where id = $1", [me]))
        .rows[0].display_name;
    });
    expect(name).toBe("Aki");
  });

  it("does not let a member edit someone else's profile", async () => {
    const changed = await asUser(db, me, async (tx) => {
      const result = await tx.query("update public.profiles set display_name = 'hacked' where id = $1", [friend]);
      return result.affectedRows;
    });
    expect(changed).toBe(0);
  });

  it.each(["is_admin = true", "payee_id = null", "trial_ends_at = now()", "deactivated_at = null"])(
    "does not let a member set %s on their own profile",
    async (assignment) => {
      await expect(
        asUser(db, me, (tx) => tx.query(`update public.profiles set ${assignment} where id = $1`, [me])),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it.each(["study_logs", "penalties", "settlements", "activity_events", "peer_reviews"])(
    "does not let a member insert into %s",
    async (table) => {
      await expect(asUser(db, me, (tx) => tx.query(`insert into public.${table} default values`))).rejects.toThrow(
        /permission denied/,
      );
    },
  );

  it("shows a member only their own notifications and lets them mark them read", async () => {
    const account = (await db.query<{ a: string }>("select auth_user_id as a from public.profiles where id = $1", [me])).rows[0].a;
    await asService(db, async (tx) => {
      const event = await tx.query<{ id: string }>(
        "insert into public.activity_events (type, actor_id) values ('declared', $1) returning id",
        [friend],
      );
      await tx.query(
        "insert into public.notifications (recipient_id, event_id, title) values ($1, $3, 'for me'), ($2, $3, 'for friend')",
        [me, friend, event.rows[0].id],
      );
      await tx.exec("reset role");
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [account]);

      const visible = await tx.query<{ title: string }>("select title from public.notifications");
      expect(visible.rows.map((r) => r.title)).toEqual(["for me"]);

      const marked = await tx.query("update public.notifications set read_at = now()");
      expect(marked.affectedRows).toBe(1);

      await expect(tx.query("update public.notifications set title = 'x'")).rejects.toThrow(/permission denied/);
    });
  });

  it("lets members upload evidence only into their own folder", async () => {
    await asUser(db, me, async (tx) => {
      await tx.query("insert into storage.objects (bucket_id, name) values ('study-evidence', $1)", [
        `${me}/2026-10-16/a.webp`,
      ]);
      await expect(
        tx.query("insert into storage.objects (bucket_id, name) values ('study-evidence', $1)", [
          `${friend}/2026-10-16/b.webp`,
        ]),
      ).rejects.toThrow(/row-level security/);
    });
  });
});
