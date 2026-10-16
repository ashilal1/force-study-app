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

/** Signs in with Google and joins the group with the invite code (join_group). */
export async function createMember(db: Queryable, name: string): Promise<string> {
  const id = await createAuthUser(db, `${name}@example.com`);
  await db.query("select public.join_group($1, $2, null)", [id, name]);
  return id;
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
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await tx.exec(`set local role ${role}`);
      result = await fn(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
  return result as T;
}
