import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "./harness";

describe("migrations", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("apply cleanly and seed one group_settings row", async () => {
    const { rows } = await db.query<{ count: number }>("select count(*)::int as count from public.group_settings");
    expect(rows[0].count).toBe(1);
  });
});
