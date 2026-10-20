import { describe, expect, it } from "vitest";
import { lookFor, seasonLabel, seasonOf, zodiacOf } from "@/lib/theme/themes";

describe("seasonOf", () => {
  it("covers each season with both ends included", () => {
    expect(seasonOf("2026-09-30")).toBeNull();
    expect(seasonOf("2026-10-01")?.id).toBe("halloween");
    expect(seasonOf("2026-10-31")?.id).toBe("halloween");
    expect(seasonOf("2026-11-01")).toBeNull();
    expect(seasonOf("2026-12-01")?.id).toBe("christmas");
    expect(seasonOf("2026-12-25")?.id).toBe("christmas");
    expect(seasonOf("2026-12-26")).toBeNull();
    expect(seasonOf("2027-01-01")?.id).toBe("newyear");
    expect(seasonOf("2027-01-07")?.id).toBe("newyear");
    expect(seasonOf("2027-01-08")).toBeNull();
  });

  it("labels a season", () => {
    expect(seasonLabel({ from: "10-01", to: "10-31" })).toBe("10/1〜10/31");
  });
});

describe("zodiacOf", () => {
  it("names the year's sign", () => {
    expect(zodiacOf(2027)).toBe("未");
    expect(zodiacOf(2026)).toBe("午");
    expect(zodiacOf(2032)).toBe("子");
    expect(zodiacOf(2019)).toBe("亥");
  });
});

describe("lookFor", () => {
  const base = { picked: null, seasonThemes: true, rank: "yuutousei" as const, today: "2026-11-10" };

  it("is 標準 (the rank look) until something is picked", () => {
    expect(lookFor(base)).toEqual({ kind: "rank" });
    expect(lookFor({ ...base, picked: "forest" })).toEqual({ kind: "theme", id: "forest" });
  });

  it("reads an unknown or seasonal id as 標準", () => {
    expect(lookFor({ ...base, picked: "neon" })).toEqual({ kind: "rank" });
    expect(lookFor({ ...base, picked: "halloween" })).toEqual({ kind: "rank" });
  });

  it("lets the season take over while it lasts, unless switched off", () => {
    const halloween = { ...base, picked: "ocean", today: "2026-10-20" };
    expect(lookFor(halloween)).toEqual({ kind: "theme", id: "halloween" });
    expect(lookFor({ ...halloween, seasonThemes: false })).toEqual({ kind: "theme", id: "ocean" });
    expect(lookFor({ ...halloween, picked: null, seasonThemes: false })).toEqual({ kind: "rank" });
  });

  it("keeps どうしようもない on its concrete, season or not", () => {
    const worst = { ...base, rank: "doushiyou-mo-nai" as const, picked: "sakura" };
    expect(lookFor(worst)).toEqual({ kind: "rank" });
    expect(lookFor({ ...worst, today: "2026-12-24" })).toEqual({ kind: "rank" });
  });
});
