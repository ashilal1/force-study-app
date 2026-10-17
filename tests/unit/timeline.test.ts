import { describe, expect, it } from "vitest";
import { draftNotifications } from "@/lib/notify/rules";

// The timeline uses the notification rules with an onlooker who took part in nothing
// (src/lib/timeline.ts). Check that this keeps public events and drops private ones.

const members = [
  { id: "aki", display_name: "あき" },
  { id: "ben", display_name: "べん" },
  { id: "__timeline__", display_name: "" },
];
const forOnlooker = (type: string, actor: string, payload: Record<string, unknown> = {}) =>
  draftNotifications({ id: "e", type, actor_id: actor, study_log_id: "log-1", payload }, members).find(
    (draft) => draft.recipientId === "__timeline__",
  );

describe("timeline wording", () => {
  it("keeps what everyone else is told", () => {
    expect(forOnlooker("declared", "aki", { declaration: "演習", target_end_time: "2026-10-20T12:00:00Z" })?.title).toBe(
      "あき さんが宣言しました",
    );
    expect(forOnlooker("no_declaration", "aki", { points: 500 })?.title).toBe("あき さんが宣言しませんでした");
  });

  it("drops reminders, votes and notices meant for one person", () => {
    expect(forOnlooker("reminder_submit", "aki", { deadline: "2026-10-20T12:00:00Z" })).toBeUndefined();
    expect(forOnlooker("review_vote_cast", "ben", { subject_type: "excuse", owner_id: "aki", verdict: "accept" })).toBeUndefined();
    expect(forOnlooker("settlement_created", "aki", { payee_id: "ben", amount: 500 })).toBeUndefined();
  });
});
