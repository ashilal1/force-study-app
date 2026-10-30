import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asUser, createMember, createTestDb, setNow, type Db } from "./harness";

// F4c: the start photo and the progress photos taken while studying (ADR-050). Times are JST.

type Photo = { id: string; kind: string; image_path: string | null; taken_at: string };

async function setup() {
  const db = await createTestDb();
  await setNow(db, "2026-10-01 09:00");
  const aki = await createMember(db, "aki");
  const ben = await createMember(db, "ben");
  await db.query("update public.profiles set trial_ends_at = '2026-01-01'");
  return { db, aki, ben };
}

async function declare(db: Db, userId: string, date: string): Promise<string> {
  await setNow(db, `${date} 09:00`);
  const { rows } = await db.query<{ study_log_id: string }>(
    "select study_log_id from public.declare_goal($1, '演習', '15:00'::time, 'さくら 47')",
    [userId],
  );
  return rows[0].study_log_id;
}

const path = (userId: string, date: string) => `${userId}/${date}/${randomUUID()}.webp`;

async function addPhoto(db: Db, userId: string, logId: string, date: string, at: string, image = path(userId, date)) {
  await setNow(db, `${date} ${at}`);
  return (await db.query<Photo>("select * from public.add_study_photo($1, $2, $3, null)", [userId, logId, image])).rows[0];
}

async function submit(db: Db, userId: string, logId: string, date: string) {
  return db.query<{ submission_id: string }>("select submission_id from public.create_submission($1, $2, $3, null, 'a', 'b', 3)", [
    userId,
    logId,
    [path(userId, date)],
  ]);
}

describe("add_study_photo", () => {
  it("takes the start photo first, then progress photos at least 25 minutes apart", async () => {
    const { db, aki } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    const start = await addPhoto(db, aki, logId, "2026-10-20", "09:05");
    expect(start.kind).toBe("start");
    await expect(addPhoto(db, aki, logId, "2026-10-20", "09:29")).rejects.toThrow(/photo_too_soon/);
    const progress = await addPhoto(db, aki, logId, "2026-10-20", "09:30");
    expect(progress.kind).toBe("progress");
    await expect(addPhoto(db, aki, logId, "2026-10-20", "09:54")).rejects.toThrow(/photo_too_soon/);
  });

  it("follows the group's gap, and stops at six photos a day", async () => {
    const { db, aki } = await setup();
    await db.query("update public.group_settings set photo_gap_minutes = 5");
    const logId = await declare(db, aki, "2026-10-20");
    for (const at of ["09:00", "09:05", "09:10", "09:15", "09:20", "09:25"]) await addPhoto(db, aki, logId, "2026-10-20", at);
    await expect(addPhoto(db, aki, logId, "2026-10-20", "09:30")).rejects.toThrow(/photo_limit/);
  });

  it("is only for one's own open day, before its deadline, in one's own folder", async () => {
    const { db, aki, ben } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await expect(addPhoto(db, ben, logId, "2026-10-20", "09:05")).rejects.toThrow(/not_found/);
    await expect(addPhoto(db, aki, logId, "2026-10-20", "09:05", path(ben, "2026-10-20"))).rejects.toThrow(/invalid_images/);
    await expect(addPhoto(db, aki, logId, "2026-10-20", "09:05", path(aki, "2026-10-19"))).rejects.toThrow(/invalid_images/);
    await expect(addPhoto(db, aki, logId, "2026-10-21", "15:00")).rejects.toThrow(/deadline_passed/);
  });

  it("waits while a submission is being judged, and ends once the day passed", async () => {
    const { db, aki } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await setNow(db, "2026-10-20 10:00");
    const { rows } = await submit(db, aki, logId, "2026-10-20");
    await expect(addPhoto(db, aki, logId, "2026-10-20", "10:01")).rejects.toThrow(/judging_in_progress/);
    await db.query("select public.record_judgement($1, 90, true, 'ok', 'test')", [rows[0].submission_id]);
    await expect(addPhoto(db, aki, logId, "2026-10-20", "10:02")).rejects.toThrow(/already_passed/);
  });

  it("calls a photo after a rejected submission a progress photo", async () => {
    const { db, aki } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await setNow(db, "2026-10-20 10:00");
    const { rows } = await submit(db, aki, logId, "2026-10-20");
    await db.query("select public.record_judgement($1, 40, true, 'no', 'test')", [rows[0].submission_id]);
    expect((await addPhoto(db, aki, logId, "2026-10-20", "10:05")).kind).toBe("progress");
  });
});

describe("start_photo_required", () => {
  it("is off by default: submitting works without photos", async () => {
    const { db, aki } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    await setNow(db, "2026-10-20 10:00");
    await expect(submit(db, aki, logId, "2026-10-20")).resolves.toBeTruthy();
  });

  it("when on, needs the start photo before submitting", async () => {
    const { db, aki } = await setup();
    await db.query("update public.group_settings set start_photo_required = true");
    const logId = await declare(db, aki, "2026-10-20");
    await setNow(db, "2026-10-20 10:00");
    await expect(submit(db, aki, logId, "2026-10-20")).rejects.toThrow(/start_photo_missing/);
    await addPhoto(db, aki, logId, "2026-10-20", "10:01");
    await setNow(db, "2026-10-20 11:00");
    await expect(submit(db, aki, logId, "2026-10-20")).resolves.toBeTruthy();
  });

  it("is an admin setting, with the gap", async () => {
    const { db, aki } = await setup();
    await db.query("update public.profiles set is_admin = true where id = $1", [aki]);
    const { rows } = await db.query<{ payload: { changes: Record<string, unknown> } }>(
      "select payload from public.update_group_settings($1, $2)",
      [aki, { start_photo_required: true, photo_gap_minutes: 30 }],
    );
    expect(rows[0].payload.changes).toEqual({ start_photo_required: true, photo_gap_minutes: 30 });
    await expect(db.query("select public.update_group_settings($1, $2)", [aki, { photo_gap_minutes: 1 }])).rejects.toThrow(/invalid_setting/);
  });
});

describe("photo purges", () => {
  it("lists originals of closed days past the retention period, then records the purge", async () => {
    const { db, aki } = await setup();
    await db.query("insert into storage.buckets (id, name) values ('study-evidence', 'study-evidence') on conflict do nothing");
    const closed = await declare(db, aki, "2026-08-01");
    const old = await addPhoto(db, aki, closed, "2026-08-01", "09:05");
    await db.query("update public.study_logs set status = 'missed', missed_at = now() where id = $1", [closed]);
    const open = await declare(db, aki, "2026-10-20");
    await addPhoto(db, aki, open, "2026-10-20", "09:05");
    await setNow(db, "2026-10-20 12:00");

    const { rows } = await db.query("select * from public.due_photo_purges(100)");
    expect(rows).toEqual([{ photo_id: old.id, image_path: old.image_path }]);
    await db.query("select public.mark_photos_purged($1)", [[old.id]]);
    const { rows: after } = await db.query("select image_path, images_purged_at is not null as purged from public.study_photos where id = $1", [old.id]);
    expect(after).toEqual([{ image_path: null, purged: true }]);
    expect((await db.query("select * from public.due_photo_purges(100)")).rows).toEqual([]);
  });
});

describe("study_photos rows", () => {
  it("are read by the group, and never deleted or rewritten", async () => {
    const { db, aki, ben } = await setup();
    const logId = await declare(db, aki, "2026-10-20");
    const photo = await addPhoto(db, aki, logId, "2026-10-20", "09:05");
    const seen = await asUser(db, ben, async (tx) => (await tx.query("select id from public.study_photos")).rows);
    expect(seen).toEqual([{ id: photo.id }]);
    await expect(db.query("delete from public.study_photos")).rejects.toThrow();
    await expect(db.query("update public.study_photos set kind = 'progress'")).rejects.toThrow();
    await expect(asUser(db, aki, (tx) => tx.query("select public.add_study_photo($1, $2, $3, null)", [aki, logId, path(aki, "2026-10-20")]))).rejects.toThrow();
  });
});
