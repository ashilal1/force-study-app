import { beforeAll, describe, expect, it } from "vitest";
import { asService, createMember, createTestDb, type Db } from "./harness";

describe("history is append-only (ADR-020)", () => {
  let db: Db;
  let me: string;
  let friend: string;
  let logId: string;

  beforeAll(async () => {
    db = await createTestDb();
    me = await createMember(db, "aki");
    friend = await createMember(db, "ben");
    const { rows } = await db.query<{ id: string }>(
      `insert into public.study_logs (user_id, date, status, declaration, target_end_time, passphrase, declared_at, missed_at)
       values ($1, '2026-10-16', 'missed', 'linear algebra ch.3', now() + interval '1 hour', 'sakura 47', now(), now())
       returning id`,
      [me],
    );
    logId = rows[0].id;
  });

  it("refuses to delete history, even for the server", async () => {
    await expect(asService(db, (tx) => tx.query("delete from public.study_logs where id = $1", [logId]))).rejects.toThrow(
      /append-only/,
    );
  });

  it("refuses to change frozen columns", async () => {
    await expect(
      asService(db, (tx) => tx.query("update public.study_logs set date = '2026-10-15' where id = $1", [logId])),
    ).rejects.toThrow(/append-only/);
  });

  it("allows state columns to change", async () => {
    await asService(db, async (tx) => {
      const result = await tx.query("update public.study_logs set status = 'missed' where id = $1", [logId]);
      expect(result.affectedRows).toBe(1);
    });
  });

  it("keeps the original declaration when it is rewritten, and only once", async () => {
    await asService(db, async (tx) => {
      const pending = await tx.query<{ id: string }>(
        `insert into public.study_logs (user_id, date, status, declaration, target_end_time, passphrase, declared_at)
         values ($1, '2026-10-17', 'pending', 'read 5 minutes', now() + interval '2 hours', 'umi 12', now())
         returning id`,
        [me],
      );
      const id = pending.rows[0].id;

      await expect(
        tx.query("update public.study_logs set declaration = 'sneaky edit', revision_due_at = now() where id = $1", [id]),
      ).rejects.toThrow(/keep the original/);
    });

    await asService(db, async (tx) => {
      const pending = await tx.query<{ id: string }>(
        `insert into public.study_logs (user_id, date, status, declaration, target_end_time, passphrase, declared_at)
         values ($1, '2026-10-18', 'pending', 'read 5 minutes', now() + interval '2 hours', 'umi 12', now())
         returning id`,
        [me],
      );
      const id = pending.rows[0].id;
      await tx.query(
        `update public.study_logs
         set original_declaration = declaration, declaration = 'solve 20 problems', revision_due_at = now(), revised_at = now()
         where id = $1`,
        [id],
      );
      await expect(
        tx.query("update public.study_logs set declaration = 'third version' where id = $1", [id]),
      ).rejects.toThrow(/only once/);
    });
  });

  it("freezes a filed failure report", async () => {
    await asService(db, async (tx) => {
      await tx.query(
        `insert into public.failure_reports (study_log_id, user_id, status, category, next_plan_text, unrealistic_streak,
           report_due_at, reported_at, outcome, resolved_at)
         values ($1, $2, 'resolved', 'unrealistic', 'split chapter 3 into two days and do the exercises first', 1,
           now(), now(), 'no_penalty', now())`,
        [logId, me],
      );
      await expect(
        tx.query("update public.failure_reports set next_plan_text = 'changed my mind' where study_log_id = $1", [logId]),
      ).rejects.toThrow(/cannot be changed/);
    });
  });

  it("freezes a cast vote", async () => {
    await asService(db, async (tx) => {
      await tx.query(
        `insert into public.peer_reviews (subject_type, subject_id, reviewer_id, verdict, decided_at)
         values ('excuse', $1, $2, 'reject', now())`,
        [logId, friend],
      );
      await expect(
        tx.query("update public.peer_reviews set verdict = 'accept' where subject_id = $1", [logId]),
      ).rejects.toThrow(/cannot be changed/);
    });
  });

  it("requires a reason to reject a dispute", async () => {
    await expect(
      asService(db, (tx) =>
        tx.query(
          `insert into public.peer_reviews (subject_type, subject_id, reviewer_id, verdict, decided_at)
           values ('dispute', $1, $2, 'reject', now())`,
          [logId, friend],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
