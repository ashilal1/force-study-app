import { describe, expect, it } from "vitest";
import { pickTip, TIPS } from "@/lib/tips";

describe("pickTip", () => {
  it("shows the first candidate not seen yet, skipping ones that don't apply", () => {
    expect(pickTip([], [false, ["passphrase", "a"], ["give_up", "b"]])).toEqual(["passphrase", "a"]);
    expect(pickTip(["passphrase"], [["passphrase", "a"], null, ["give_up", "b"]])).toEqual(["give_up", "b"]);
    expect(pickTip(["passphrase", "give_up"], [["passphrase", "a"], ["give_up", "b"]])).toBeNull();
  });

  it("shows nothing to someone who has seen them all", () => {
    expect(pickTip(["*"], [["home_todo", "a"]])).toBeNull();
  });
});

describe("TIPS", () => {
  it("words the judge result by outcome", () => {
    expect(TIPS.judge_result({ passed: true, attemptsLeft: 2, disputeHours: 24 })).toContain("24 時間");
    expect(TIPS.judge_result({ passed: false, attemptsLeft: 2, disputeHours: 24 })).toContain("あと 2 回");
    expect(TIPS.judge_result({ passed: false, attemptsLeft: 0, disputeHours: 24 })).toContain("できなかった");
  });

  it("puts the group's amounts in", () => {
    expect(TIPS.settlement({ lateYen: 1500 })).toContain("1,500 円");
    expect(TIPS.review({ target: "excuse", yen: 500 })).toContain("500 円");
  });
});
