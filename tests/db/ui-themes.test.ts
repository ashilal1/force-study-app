import { describe, expect, it } from "vitest";
import { asUser, createMember, createTestDb, type Db } from "./harness";

// Look themes (F16): the theme a member picked for their own screens, and the seasonal switch.

async function look(db: Db, id: string) {
  const { rows } = await db.query<{ ui_theme: string | null; season_themes: boolean }>(
    "select ui_theme, season_themes from public.profiles where id = $1",
    [id],
  );
  return rows[0];
}

describe("set_ui_theme", () => {
  it("starts on 標準 with the seasons on, and saves a pick", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    expect(await look(db, me)).toEqual({ ui_theme: null, season_themes: true });

    await db.query("select public.set_ui_theme($1, 'forest', false)", [me]);
    expect(await look(db, me)).toEqual({ ui_theme: "forest", season_themes: false });

    await db.query("select public.set_ui_theme($1, null, null)", [me]);
    expect(await look(db, me)).toEqual({ ui_theme: null, season_themes: true });
  });

  it("checks the id's shape", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    for (const bad of ["", "Forest", "for-est", "x".repeat(21)]) {
      await expect(db.query("select public.set_ui_theme($1, $2, true)", [me, bad])).rejects.toThrow(/invalid_theme/);
    }
  });

  it("refuses someone who is not a member", async () => {
    const db = await createTestDb();
    await expect(db.query("select public.set_ui_theme(gen_random_uuid(), 'forest', true)")).rejects.toThrow(/not_a_member/);
  });

  it("isn't callable from the browser, and members can't write the columns themselves", async () => {
    const db = await createTestDb();
    const me = await createMember(db, "aki");
    await expect(asUser(db, me, (tx) => tx.query("select public.set_ui_theme($1, 'forest', true)", [me]))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asUser(db, me, (tx) => tx.query("update public.profiles set ui_theme = 'forest' where id = $1", [me])),
    ).rejects.toThrow(/permission denied/);
  });
});
