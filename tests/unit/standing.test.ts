import { describe, expect, it } from "vitest";
import type { DayKind } from "@/lib/chart-colors";
import {
  computeStandings,
  lastCloseOf,
  nextRank,
  rankOf,
  titlesOf,
  weeklyWinners,
  xpEvents,
  xpWindow,
  type StandingContext,
  type StandingDay,
  type StandingInput,
} from "@/lib/standing/rules";
import { addDays } from "@/lib/time";

// F13 titles, F14 XP and ranks (ADR-037, ADR-039). Dates are JST.

const TODAY = "2026-11-20"; // Friday
const ctx: StandingContext = {
  today: TODAY,
  now: new Date(`${TODAY}T20:00:00+09:00`).getTime(),
  lastClose: lastCloseOf(TODAY, new Date(`${TODAY}T20:00:00+09:00`).getTime(), 6, "23:59"),
  unrealisticStreakThreshold: 4,
};

function day(date: string, kind: DayKind, extra: Partial<StandingDay> = {}): StandingDay {
  return {
    date,
    kind,
    inTrial: false,
    finalScore: kind === "completed" ? 80 : null,
    attempts: kind === "completed" ? 1 : 0,
    failureCategory: null,
    declaredAt: kind === "no_declaration" || kind === "rest" || kind === "leave" || kind === "none" ? null : `${date}T10:00:00+09:00`,
    targetEndTime: `${addDays(date, 1)}T12:00:00+09:00`,
    passedSubmittedAt: kind === "completed" ? `${date}T20:00:00+09:00` : null,
    completedAt: kind === "completed" ? `${addDays(date, 1)}T20:00:00+09:00` : null,
    flaggedAt: [],
    ...extra,
  };
}

/** `kinds` ending yesterday (today is pending). */
function days(kinds: DayKind[], extra: (date: string, index: number) => Partial<StandingDay> = () => ({})): StandingDay[] {
  const start = addDays(TODAY, -kinds.length);
  return [
    ...kinds.map((kind, index) => day(addDays(start, index), kind, extra(addDays(start, index), index))),
    day(TODAY, "pending", { declaredAt: null }),
  ];
}

function member(id: string, list: StandingDay[], extra: Partial<StandingInput> = {}): StandingInput {
  return {
    memberId: id,
    joinedOn: "2026-09-01",
    trialEndsAt: "2026-09-06T00:00:00+09:00",
    days: list,
    penalties: [],
    freeUnrealisticAt: [],
    settlements: [],
    makeup: { completedAt: [], passedAt: [], debts: [], overdue: 0 },
    ...extra,
  };
}

const NONE = { kakinKing: new Set<string>(), mukakin: new Set<string>(), mvp: new Set<string>(), kansai: new Set<string>() };
const titleIds = (input: StandingInput) => titlesOf(input, ctx, NONE).map((title) => (title.trial ? `${title.id}?` : title.id));

describe("ranks", () => {
  it("uses the ADR-039 thresholds", () => {
    expect([-50, -49, 49, 50, 149, 150, 299, 300].map((xp) => rankOf(xp).name)).toEqual([
      "どうしようもない",
      "三日坊主",
      "三日坊主",
      "やればできる",
      "やればできる",
      "優等生",
      "優等生",
      "天才",
    ]);
    expect(nextRank(120)).toMatchObject({ name: "優等生", needed: 30 });
    expect(nextRank(300)).toBeNull();
  });
});

describe("xpEvents", () => {
  it("adds 10 a completed day, 3 for 90+, 20 every 7 in a row; subtracts penalties", () => {
    const list = days(Array(7).fill("completed"), (_, index) => ({ finalScore: index === 0 ? 95 : 80 }));
    const events = xpEvents(
      member("aki", list, {
        penalties: [
          { reason: "slacked", at: `${TODAY}T08:00:00+09:00`, waived: false },
          { reason: "no_declaration", at: `${TODAY}T08:00:00+09:00`, waived: true },
        ],
      }),
      TODAY,
    );
    const sum = events.reduce((total, event) => total + event.points, 0);
    expect(sum).toBe(7 * 10 + 3 + 20 - 25);
  });

  it("skips anything from the trial week", () => {
    const list = days(["completed", "completed"]);
    const input = member("aki", list, { trialEndsAt: `${TODAY}T00:00:00+09:00` });
    // Completed on the day before today and the one before that: completion lands the next day.
    expect(xpEvents(input, TODAY).map((event) => event.date)).toEqual([TODAY]);
  });
});

describe("xpWindow", () => {
  it("covers 28 days, reaching back past leave", () => {
    const list = days(["leave", "leave", "leave"]);
    const window = xpWindow(list, TODAY);
    expect(window.size).toBe(28);
    expect(window.has(addDays(TODAY, -1))).toBe(false);
    expect(window.has(addDays(TODAY, -30))).toBe(true);
  });
});

describe("titlesOf", () => {
  it("counts this month's slacking (サボラー) and no-declaration days (寝坊助)", () => {
    const list = days(["no_declaration", "no_declaration", "no_declaration", "missed", "missed", "completed"], (_, index) =>
      index >= 3 && index <= 4 ? { failureCategory: "slacked" } : {},
    );
    // 潔白 too: no 「怪しい」 in 28 days, with a passed submission.
    expect(titleIds(member("aki", list))).toEqual(["saborer", "nebosuke", "keppaku"]);
  });

  it("gives 未達の王 for five failed days in a row, broken by a completed day", () => {
    expect(titleIds(member("aki", days(["completed", "missed", "rest", "missed", "no_declaration", "invalidated", "missed"])))).toEqual([
      "mitatsu-king",
      "sagishi-giwaku",
      "keppaku",
    ]);
    expect(titleIds(member("aki", days(["missed", "missed", "missed", "missed", "completed"])))).toEqual(["keppaku"]);
  });

  it("shows only the highest streak tier, and morning / first-try / score titles", () => {
    const list = days(Array(30).fill("completed"), () => ({ declaredAt: undefined, finalScore: 95 })).map((entry) =>
      entry.kind === "completed" ? { ...entry, declaredAt: `${entry.date}T07:30:00+09:00` } : entry,
    );
    expect(titleIds(member("aki", list))).toEqual(["shukan-oni", "ippatsuya", "high-scorer", "asagata", "keppaku"]);
  });

  it("puts states first: 逃走者 (makeup overdue) and 貧乏人 (late settlement)", () => {
    const input = member("aki", days(["completed"]), {
      makeup: { completedAt: [], passedAt: [], debts: [], overdue: 1 },
      settlements: [{ periodEnd: "2026-11-07", amount: 500, status: "open", late: true }],
    });
    expect(titleIds(input)).toEqual(["tousousha", "binbounin", "keppaku"]);
  });

  it("loses 潔白 to a 「怪しい」 in the last 28 days", () => {
    const list = days(["completed", "completed"], (_, index) => (index === 0 ? { flaggedAt: [`${TODAY}T01:00:00+09:00`] } : {}));
    expect(titleIds(member("aki", list))).not.toContain("keppaku");
  });

  it("gives 皆勤賞 for a perfect last month, only with the whole month on record", () => {
    const partial = days(Array(20).fill("completed")); // 10/31-11/19: October isn't complete
    expect(titleIds(member("aki", partial))).not.toContain("kaikin");
    const october = Array.from({ length: 31 }, (_, index) => day(`2026-10-${String(index + 1).padStart(2, "0")}`, index % 7 === 0 ? "rest" : "completed"));
    expect(titleIds(member("aki", [...october, day(TODAY, "pending")]))).toContain("kaikin");
  });

  it("shows trial-only bad titles as 「本番なら」 while still in the trial", () => {
    const list = days(["missed", "missed", "missed", "missed", "missed"], () => ({ inTrial: true }));
    const input = member("aki", list, { trialEndsAt: `${addDays(TODAY, 2)}T00:00:00+09:00` });
    expect(titleIds(input)).toEqual(["mitatsu-king?"]);
  });
});

describe("weeklyWinners", () => {
  it("names the week's biggest payer, the zero payers who played, and the XP leader", () => {
    const close = ctx.lastClose!.date; // 2026-11-14
    const week = (kind: DayKind) => Array.from({ length: 7 }, (_, index) => day(addDays(close, index - 6), kind));
    const winners = weeklyWinners(
      [
        member("aki", week("completed")),
        member("ben", week("missed"), { settlements: [{ periodEnd: close, amount: 1400, status: "open", late: false }] }),
        member("cho", week("rest")),
      ],
      ctx,
    );
    expect([...winners.kakinKing]).toEqual(["ben"]);
    expect([...winners.mukakin]).toEqual(["aki"]);
    expect([...winners.mvp]).toEqual(["aki"]);
  });
});

describe("computeStandings", () => {
  it("crowns the leader and tilts the last, only with 3+ members who differ", () => {
    const standings = computeStandings(
      [member("aki", days(["completed", "completed"])), member("ben", days(["completed"])), member("cho", days(["missed"]))],
      ctx,
    );
    expect([...standings.values()].map((s) => [s.memberId, s.xp, s.crown, s.last])).toEqual([
      ["aki", 20, true, false],
      ["ben", 10, false, false],
      ["cho", 0, false, true],
    ]);

    const even = computeStandings([member("aki", days([])), member("ben", days([])), member("cho", days([]))], ctx);
    expect([...even.values()].some((s) => s.crown || s.last)).toBe(false);
  });
});

describe("lastCloseOf", () => {
  it("is the latest Saturday 23:59 that has passed", () => {
    expect(lastCloseOf("2026-11-21", new Date("2026-11-21T23:58:00+09:00").getTime(), 6, "23:59:00").date).toBe("2026-11-14");
    expect(lastCloseOf("2026-11-21", new Date("2026-11-21T23:59:30+09:00").getTime(), 6, "23:59:00").date).toBe("2026-11-21");
  });
});
