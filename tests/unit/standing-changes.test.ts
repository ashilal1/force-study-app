import { describe, expect, it } from "vitest";
import { diffStandings, sameSnapshot, type Snapshot } from "@/lib/standing/changes";

// ADR-041: only changes are recorded and announced.

const base: Snapshot = {
  members: {
    aki: { rank: "mikka-bouzu", titles: ["keizoku"] },
    ben: { rank: "yareba-dekiru", titles: [] },
  },
  crown: ["ben"],
};

describe("diffStandings", () => {
  it("announces nothing on the first run or for a new member", () => {
    expect(diffStandings(null, base)).toEqual([]);
    const withCho: Snapshot = { ...base, members: { ...base.members, cho: { rank: "tensai", titles: ["mvp"] } } };
    expect(diffStandings(base, withCho)).toEqual([]);
  });

  it("finds titles gained and lost, rank moves and a new crown", () => {
    const next: Snapshot = {
      members: {
        aki: { rank: "yareba-dekiru", titles: ["saborer"] },
        ben: { rank: "mikka-bouzu", titles: [] },
      },
      crown: ["aki"],
    };
    expect(diffStandings(base, next)).toEqual([
      { type: "title_awarded", actor_id: "aki", payload: { title: "saborer" } },
      { type: "title_removed", actor_id: "aki", payload: { title: "keizoku" } },
      { type: "rank_changed", actor_id: "aki", payload: { from: "mikka-bouzu", to: "yareba-dekiru", up: true } },
      { type: "rank_changed", actor_id: "ben", payload: { from: "yareba-dekiru", to: "mikka-bouzu", up: false } },
      { type: "crown_moved", actor_id: "aki", payload: { from: ["ben"] } },
    ]);
  });
});

describe("sameSnapshot", () => {
  it("ignores order", () => {
    const shuffled: Snapshot = {
      members: { ben: base.members.ben, aki: { rank: "mikka-bouzu", titles: ["keizoku"] } },
      crown: ["ben"],
    };
    expect(sameSnapshot(base, shuffled)).toBe(true);
    expect(sameSnapshot(null, base)).toBe(false);
  });
});
