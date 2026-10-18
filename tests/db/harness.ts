import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

export type Db = PGlite;
type Queryable = PGlite | Transaction;

/** Fresh in-memory Postgres with the Supabase stubs and every migration applied, in order. */
export async function createTestDb(): Promise<Db> {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(readFileSync(join(__dirname, "supabase-stubs.sql"), "utf8"));
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (error) {
      throw new Error(`migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

/** Creates an auth user (as Google sign-in would) and returns its id. */
export async function createAuthUser(db: Queryable, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return rows[0].id;
}

/** A random 64-hex-char string standing in for the SHA-256 of an invite code. */
export function randomHash(): string {
  return randomBytes(32).toString("hex");
}

/** Issues an invite as `inviterId` (create_invite) and returns the code hash. */
export async function createInvite(db: Queryable, inviterId: string, hash = randomHash()): Promise<string> {
  await db.query("select public.create_invite($1, $2)", [inviterId, hash]);
  return hash;
}

/**
 * Signs in with Google and joins the group (join_group): the first member with the bootstrap
 * code, everyone after that with an invite issued by the first member.
 */
export async function createMember(db: Queryable, name: string): Promise<string> {
  const account = await createAuthUser(db, `${name}@example.com`);
  const { rows } = await db.query<{ id: string }>("select id from public.profiles order by created_at limit 1");
  const hash = rows.length === 0 ? null : await createInvite(db, rows[0].id);
  const joined = await db.query<{ id: string }>("select id from public.join_group($1, $2, null, $3, $4)", [
    account,
    name,
    hash,
    hash === null,
  ]);
  // The membership (profile) id, which every record points at (ADR-035).
  return joined.rows[0].id;
}

/**
 * Runs `fn` as the signed-in user through RLS (role `authenticated`), like the browser client does.
 * Rolled back afterwards so tests don't leak state.
 */
export async function asUser<T>(db: Db, userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return runAs(db, "authenticated", userId, fn);
}

/** Runs `fn` as the server's secret-key client (role `service_role`). Rolled back afterwards. */
export async function asService<T>(db: Db, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return runAs(db, "service_role", "", fn);
}

const ROLLBACK = Symbol("rollback");

async function runAs<T>(db: Db, role: string, userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let result: T | undefined;
  try {
    await db.transaction(async (tx) => {
      // Tests pass membership ids; the session carries the account id behind it.
      const account = userId
        ? ((await tx.query<{ id: string }>("select coalesce((select auth_user_id from public.profiles where id = $1), $1) as id", [userId])).rows[0].id)
        : "";
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [account]);
      await tx.exec(`set local role ${role}`);
      result = await fn(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
  return result as T;
}

/**
 * Pins the clock that every rule reads (private.now(), and so jst_today()) for this session.
 * Pass a JST wall-clock time like "2026-10-20 09:00".
 */
export async function setNow(db: Queryable, jst: string): Promise<void> {
  await db.query("select set_config('app.now', $1, false)", [`${jst}+09`]);
}
