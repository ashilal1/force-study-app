import { describe, expect, it } from "vitest";
import { lookFor, seasonOf, zodiacOf } from "@/lib/theme/themes";

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
  const base = { seasonThemes: true, rank: "yuutousei" as const, today: "2026-11-10" };

  it("is the rank look outside the seasons", () => {
    expect(lookFor(base)).toEqual({ kind: "rank" });
  });

  it("lets the season take over while it lasts, unless switched off", () => {
    const halloween = { ...base, today: "2026-10-20" };
    expect(lookFor(halloween)).toEqual({ kind: "theme", id: "halloween" });
    expect(lookFor({ ...halloween, seasonThemes: false })).toEqual({ kind: "rank" });
  });

  it("keeps どうしようもない on its concrete, season or not", () => {
    const worst = { ...base, rank: "doushiyou-mo-nai" as const };
    expect(lookFor(worst)).toEqual({ kind: "rank" });
    expect(lookFor({ ...worst, today: "2026-12-24" })).toEqual({ kind: "rank" });
  });
});
