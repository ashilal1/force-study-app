import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "./harness";

describe("migrations", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("apply cleanly; settings rows come with groups (M10)", async () => {
    const { rows } = await db.query<{ groups: number; settings: number; limits: number }>(
      "select (select count(*)::int from public.groups) as groups, (select count(*)::int from public.group_settings) as settings, (select count(*)::int from public.app_limits) as limits",
    );
    expect(rows[0]).toEqual({ groups: 0, settings: 0, limits: 1 });
  });
});
