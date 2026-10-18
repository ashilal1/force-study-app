import { describe, expect, it } from "vitest";
import {
  asUser,
  createAuthUser,
  createInvite,
  createMember,
  createTestDb,
  randomHash,
  type Db,
} from "./harness";

// Single-use, short-lived invites issued by members (ADR-026).

async function join(db: Db, userId: string, hash: string | null, bootstrap = false) {
  return db.query("select public.join_group($1, 'new', null, $2, $3)", [userId, hash, bootstrap]);
}

async function profileCount(db: Db) {
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.profiles");
  return rows[0].n;
}

describe("bootstrap (first member)", () => {
  it("lets the first member in without an invite, as admin", async () => {
    const db = await createTestDb();
    const id = await createAuthUser(db, "owner@example.com");
    await join(db, id, null, true);
    const { rows } = await db.query<{ is_admin: boolean }>("select is_admin from public.profiles where auth_user_id = $1", [id]);
    expect(rows).toEqual([{ is_admin: true }]);
  });

  it("is closed once anyone has joined", async () => {
    const db = await createTestDb();
    await createMember(db, "owner");
    const late = await createAuthUser(db, "late@example.com");
    await expect(join(db, late, null, true)).rejects.toThrow(/bootstrap_closed/);
    expect(await profileCount(db)).toBe(1);
  });
});

describe("invites", () => {
  it("admits exactly one person per invite", async () => {
    const db = await createTestDb();
    const owner = await createMember(db, "owner");
    const hash = await createInvite(db, owner);

    const friend = await createAuthUser(db, "friend@example.com");
    await join(db, friend, hash);
    const second = await createAuthUser(db, "second@example.com");
    await expect(join(db, second, hash)).rejects.toThrow(/invalid_invite/);

    const { rows } = await db.query<{ used_by: string; is_admin: boolean }>(
      "select p.auth_user_id as used_by, p.is_admin from public.invites i join public.profiles p on p.id = i.used_by",
    );
    expect(rows).toEqual([{ used_by: friend, is_admin: false }]);
  });

  it("rejects unknown codes", async () => {
    const db = await createTestDb();
    const owner = await createMember(db, "owner");
    await createInvite(db, owner);
    const friend = await createAuthUser(db, "friend@example.com");
    await expect(join(db, friend, randomHash())).rejects.toThrow(/invalid_invite/);
    await expect(join(db, friend, null)).rejects.toThrow(/invalid_invite/);
  });

  it("rejects expired invites", async () => {
    const db = await createTestDb();
    const owner = await createMember(db, "owner");
    const hash = randomHash();
    await db.query(
      `insert into public.invites (code_hash, created_by, created_at, expires_at, group_id)
       values ($1, $2, now() - interval '20 minutes', now() - interval '5 minutes', (select group_id from public.profiles where id = $2))`,
      [hash, owner],
    );
    const friend = await createAuthUser(db, "friend@example.com");
    await expect(join(db, friend, hash)).rejects.toThrow(/invalid_invite/);
  });

  it("expires after group_settings.invite_minutes", async () => {
    const db = await createTestDb();
    const owner = await createMember(db, "owner");
    await createInvite(db, owner);
    const { rows } = await db.query<{ minutes: number }>(
      "select extract(epoch from expires_at - created_at)::int / 60 as minutes from public.invites",
    );
    expect(rows).toEqual([{ minutes: 15 }]);
  });

  it("records who joined and who invited them", async () => {
    const db = await createTestDb();
    const owner = await createMember(db, "owner");
    const friend = await createMember(db, "friend");
    const { rows } = await db.query<{ actor_id: string; invited_by: string | null }>(
      "select type, actor_id, payload->>'invited_by' as invited_by from public.activity_events where type in ('group_created', 'member_joined') order by created_at",
    );
    // The first member created the group (M10); the next one joined with their invite.
    expect(rows).toEqual([
      { type: "group_created", actor_id: owner, invited_by: null },
      { type: "member_joined", actor_id: friend, invited_by: owner },
    ]);
  });

  it("can only be issued by active members", async () => {
    const db = await createTestDb();
    const owner = await createMember(db, "owner");
    const friend = await createMember(db, "friend");
    const outsider = await createAuthUser(db, "outsider@example.com");
    await expect(createInvite(db, outsider)).rejects.toThrow(/not_a_member/);

    await db.query("update public.profiles set deactivated_at = now(), left_reason = 'removed' where id = $1", [friend]);
    await expect(createInvite(db, friend)).rejects.toThrow(/not_a_member/);
    await expect(createInvite(db, owner)).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("group size limit", () => {
  it("stops issuing and joining once the group is full", async () => {
    const db = await createTestDb();
    const owner = await createMember(db, "owner");
    await createMember(db, "ben");
    const pending = await createInvite(db, owner);

    await db.query("update public.group_settings set max_members = 2");
    await expect(createInvite(db, owner)).rejects.toThrow(/group_full/);
    const friend = await createAuthUser(db, "friend@example.com");
    await expect(join(db, friend, pending)).rejects.toThrow(/group_full/);

    // The failed join rolled back: the invite is still unused.
    const { rows } = await db.query<{ used_at: string | null }>("select used_at from public.invites where code_hash = $1", [
      pending,
    ]);
    expect(rows).toEqual([{ used_at: null }]);
  });

  it("does not count deactivated members", async () => {
    const db = await createTestDb();
    const owner = await createMember(db, "owner");
    const ben = await createMember(db, "ben");
    await db.query("update public.group_settings set max_members = 2");
    await db.query("update public.profiles set deactivated_at = now(), left_reason = 'removed' where id = $1", [ben]);
    await expect(createInvite(db, owner)).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("invite records", () => {
  it("cannot be deleted or rewritten", async () => {
    const db = await createTestDb();
    const owner = await createMember(db, "owner");
    const hash = await createInvite(db, owner);
    await expect(db.query("delete from public.invites")).rejects.toThrow(/append-only/);
    await expect(
      db.query("update public.invites set expires_at = expires_at + interval '1 day' where code_hash = $1", [hash]),
    ).rejects.toThrow(/append-only/);
  });

  it("are invisible to members and cannot be issued from the browser", async () => {
    const db = await createTestDb();
    const owner = await createMember(db, "owner");
    await createInvite(db, owner);
    await expect(asUser(db, owner, (tx) => tx.query("select * from public.invites"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asUser(db, owner, (tx) => tx.query("select public.create_invite($1, $2)", [owner, randomHash()])),
    ).rejects.toThrow(/permission denied/);
  });
});
