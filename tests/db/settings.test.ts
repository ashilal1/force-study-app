import { describe, expect, it } from "vitest";
import { createMember, createTestDb } from "./harness";

// M8a: group settings (F11). Admin only, whitelisted keys, table constraints, sane day order.

async function setup() {
  const db = await createTestDb();
  const admin = await createMember(db, "aki");
  const member = await createMember(db, "ben");
  return { db, admin, member };
}

const update = (db: Awaited<ReturnType<typeof setup>>["db"], who: string, changes: object) =>
  db.query<{ type: string; payload: { changes: Record<string, unknown> } }>(
    "select * from public.update_group_settings($1, $2::jsonb)",
    [who, JSON.stringify(changes)],
  );

describe("update_group_settings", () => {
  it("lets the admin change listed settings and records what changed", async () => {
    const { db, admin } = await setup();
    const { rows } = await update(db, admin, { penalty_slacked: 1000, declaration_cutoff: "11:30" });
    expect(rows[0].type).toBe("settings_changed");
    expect(rows[0].payload.changes).toEqual({ penalty_slacked: 1000, declaration_cutoff: "11:30:00" });
    const settings = await db.query("select penalty_slacked, declaration_cutoff from public.group_settings");
    expect(settings.rows).toEqual([{ penalty_slacked: 1000, declaration_cutoff: "11:30:00" }]);
  });

  it("refuses non-admins, unknown keys, bad values and an impossible schedule, changing nothing", async () => {
    const { db, admin, member } = await setup();
    await expect(update(db, member, { penalty_slacked: 1 })).rejects.toThrow(/not_admin/);
    await expect(update(db, admin, { id: false })).rejects.toThrow(/invalid_setting/);
    await expect(update(db, admin, { passing_score: 150 })).rejects.toThrow(/invalid_setting/);
    await expect(update(db, admin, { max_attempts: "many" })).rejects.toThrow(/invalid_setting/);
    await expect(update(db, admin, { declaration_cutoff: "23:30" })).rejects.toThrow(/invalid_schedule/);
    await expect(update(db, admin, { first_declaration_reminder: "11:30" })).rejects.toThrow(/invalid_schedule/);
    const { rows } = await db.query("select passing_score, declaration_cutoff from public.group_settings");
    expect(rows).toEqual([{ passing_score: 70, declaration_cutoff: "12:00:00" }]);
  });

  it("moves the morning declaration reminder", async () => {
    const { db, admin } = await setup();
    const { rows } = await update(db, admin, { first_declaration_reminder: "08:30" });
    expect(rows[0].payload.changes).toEqual({ first_declaration_reminder: "08:30:00" });
  });
});
