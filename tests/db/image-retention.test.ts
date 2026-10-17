import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMember, createTestDb, setNow, type Db } from "./harness";

// M9: deleting original photos after the retention period (60 days) or while over 800MB.

const MB = 1024 * 1024;

async function setup() {
  const db = await createTestDb();
  const aki = await createMember(db, "aki");
  await db.query("insert into storage.buckets (id, name) values ('study-evidence', 'study-evidence') on conflict do nothing");
  return { db, aki };
}

/** A submission on `date` (JST) with stored photos of the given sizes in MB. */
async function photos(db: Db, userId: string, date: string, sizes: number[], status = "missed") {
  const { rows: logs } = await db.query<{ id: string }>(
    `insert into public.study_logs (user_id, date, status, declaration, target_end_time, passphrase, declared_at, missed_at)
     values ($1, $2::date, $3, '演習', ($2::date + time '15:00') at time zone 'Asia/Tokyo', 'さくら 47',
             ($2::date + time '09:00') at time zone 'Asia/Tokyo', case when $3 = 'missed' then now() end)
     returning id`,
    [userId, date, status],
  );
  const paths = sizes.map(() => `${userId}/${date}/${randomUUID()}.webp`);
  const thumb = `${userId}/${date}/${randomUUID()}_thumb.webp`;
  for (const [index, name] of paths.entries()) {
    await db.query("insert into storage.objects (bucket_id, name, metadata) values ('study-evidence', $1, $2)", [
      name,
      { size: Math.round(sizes[index] * MB) },
    ]);
  }
  await db.query("insert into storage.objects (bucket_id, name, metadata) values ('study-evidence', $1, $2)", [thumb, { size: 20_000 }]);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.submissions (study_log_id, user_id, kind, attempt_no, image_paths, thumb_path, learned_text,
       struggled_text, self_rating, status, reject_reason, submitted_at)
     values ($1, $2, 'regular', 1, $3, $4, '固有値', '重解', 4, 'rejected', 'low_score', ($5::date + time '14:00') at time zone 'Asia/Tokyo')
     returning id`,
    [logs[0].id, userId, paths, thumb, date],
  );
  return { id: rows[0].id, paths, thumb };
}

const due = async (db: Db, limit = 100) =>
  (await db.query<{ submission_id: string; image_paths: string[] }>("select * from public.due_image_purges($1)", [limit])).rows;

describe("due_image_purges", () => {
  it("lists originals past the retention period, oldest first, but not open days", async () => {
    const { db, aki } = await setup();
    const old = await photos(db, aki, "2026-08-01", [0.2, 0.2]);
    const older = await photos(db, aki, "2026-07-20", [0.2]);
    await photos(db, aki, "2026-10-10", [0.2]);
    await photos(db, aki, "2026-07-01", [0.2], "pending"); // never closed: keep
    await setNow(db, "2026-10-18 09:00");

    expect(await due(db)).toEqual([
      { submission_id: older.id, image_paths: older.paths },
      { submission_id: old.id, image_paths: old.paths },
    ]);
    expect(await due(db, 1)).toHaveLength(1);
  });

  it("follows the group's retention setting", async () => {
    const { db, aki } = await setup();
    const recent = await photos(db, aki, "2026-10-10", [0.2]);
    await db.query("update public.group_settings set image_retention_days = 7");
    await setNow(db, "2026-10-18 09:00");
    expect((await due(db)).map((row) => row.submission_id)).toEqual([recent.id]);
  });

  it("frees the oldest originals while the bucket is over 800MB", async () => {
    const { db, aki } = await setup();
    const first = await photos(db, aki, "2026-10-01", [300]);
    const second = await photos(db, aki, "2026-10-02", [300]);
    await photos(db, aki, "2026-10-03", [300]);
    await setNow(db, "2026-10-04 09:00");
    // 900MB stored: removing the oldest (300MB) is enough.
    expect((await due(db)).map((row) => row.submission_id)).toEqual([first.id]);

    await photos(db, aki, "2026-10-04", [300]);
    // 1200MB: two oldest.
    expect((await due(db)).map((row) => row.submission_id)).toEqual([first.id, second.id]);
  });
});

describe("mark_images_purged", () => {
  it("empties the originals once and keeps the thumbnail", async () => {
    const { db, aki } = await setup();
    const old = await photos(db, aki, "2026-07-01", [0.2]);
    await setNow(db, "2026-10-18 09:00");

    const first = await db.query<{ n: number }>("select public.mark_images_purged($1) as n", [[old.id]]);
    const again = await db.query<{ n: number }>("select public.mark_images_purged($1) as n", [[old.id]]);
    expect([first.rows[0].n, again.rows[0].n]).toEqual([1, 0]);

    const { rows } = await db.query<{ image_paths: string[]; thumb_path: string; images_purged_at: string | null }>(
      "select image_paths, thumb_path, images_purged_at from public.submissions where id = $1",
      [old.id],
    );
    expect(rows[0]).toMatchObject({ image_paths: [], thumb_path: old.thumb });
    expect(rows[0].images_purged_at).not.toBeNull();
    expect(await due(db)).toEqual([]);
  });

  it("is only for the server", async () => {
    const { db } = await setup();
    const { rows } = await db.query<{ allowed: boolean }>(
      "select has_function_privilege('authenticated', 'public.mark_images_purged(uuid[])', 'execute') as allowed",
    );
    expect(rows[0].allowed).toBe(false);
  });
});
