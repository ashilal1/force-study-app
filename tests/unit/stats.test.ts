import { describe, expect, it } from "vitest";
import { achievementRate, periodKey, rangeStart, ratesByPeriod, streaks, summarize, type HistoryDay } from "@/lib/stats";

const day = (date: string, kind: HistoryDay["kind"], extra: Partial<HistoryDay> = {}): HistoryDay => ({
  date,
  kind,
  finalScore: null,
  elapsedMinutes: null,
  penaltyPoints: 0,
  trialPoints: 0,
  ...extra,
});

describe("stats", () => {
  it("counts only days that had to be studied in the rate", () => {
    const days = [day("1", "completed"), day("2", "rest"), day("3", "missed"), day("4", "pending"), day("5", "no_declaration"), day("6", "completed")];
    expect(achievementRate(days)).toBe(50);
    expect(achievementRate([day("1", "rest")])).toBeNull();
  });

  it("keeps streaks across rest and leave, and breaks them on any failure", () => {
    const days = [
      day("1", "completed"),
      day("2", "completed"),
      day("3", "rest"),
      day("4", "completed"),
      day("5", "missed"),
      day("6", "completed"),
      day("7", "leave"),
      day("8", "completed"),
      day("9", "pending"),
    ];
    expect(streaks(days)).toEqual({ current: 2, best: 3 });
  });

  it("averages scores and time over achieved days, and sums penalties", () => {
    const summary = summarize([
      day("1", "completed", { finalScore: 80, elapsedMinutes: 100 }),
      day("2", "completed", { finalScore: 91, elapsedMinutes: 50 }),
      day("3", "no_declaration", { penaltyPoints: 500 }),
      day("4", "missed", { trialPoints: 700 }),
    ]);
    expect(summary).toMatchObject({ rate: 50, avgScore: 86, avgElapsedMinutes: 75, penalty: 500, trialPenalty: 700 });
  });

  it("counts ranges back from today", () => {
    expect(rangeStart("4w", "2026-10-31")).toBe("2026-10-04");
    expect(rangeStart("3m", "2026-10-31")).toBe("2026-08-03");
    expect(rangeStart("all", "2026-10-31")).toBeNull();
  });
});

describe("periodKey / ratesByPeriod (long ranges by month)", () => {
  const weeks = [
    { weekEnd: "2026-09-26", completed: 5, counted: 6 },
    { weekEnd: "2026-10-03", completed: 3, counted: 6 },
    { weekEnd: "2026-10-10", completed: 6, counted: 6 },
  ];

  it("keeps weeks up to 16 of them", () => {
    expect(periodKey("2026-10-10", 16)).toBe("2026-10-10");
    expect([...ratesByPeriod(weeks, 3)]).toEqual([
      ["2026-09-26", 83],
      ["2026-10-03", 50],
      ["2026-10-10", 100],
    ]);
  });

  it("bundles into months beyond 16 weeks, weighting by the days counted", () => {
    expect(periodKey("2026-10-10", 17)).toBe("2026-10");
    expect([...ratesByPeriod(weeks, 17)]).toEqual([
      ["2026-09", 83],
      ["2026-10", 75],
    ]);
  });
});
