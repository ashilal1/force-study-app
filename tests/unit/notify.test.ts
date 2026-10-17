import { describe, expect, it } from "vitest";
import { classifyPushStatus } from "@/lib/notify/push";
import { draftNotifications } from "@/lib/notify/rules";

const members = [
  { id: "aki", display_name: "あき" },
  { id: "ben", display_name: "べん" },
  { id: "cho", display_name: "ちょう" },
];

describe("draftNotifications", () => {
  it("tells everyone else who joined and who invited them", () => {
    const drafts = draftNotifications(
      { id: "e1", type: "member_joined", actor_id: "cho", payload: { invited_by: "aki" } },
      members,
    );
    expect(drafts).toEqual([
      { recipientId: "aki", title: "ちょう さんが参加しました", body: "あき さんの招待です", url: "/", requiresAction: false },
      { recipientId: "ben", title: "ちょう さんが参加しました", body: "あき さんの招待です", url: "/", requiresAction: false },
    ]);
  });

  it("leaves the body empty for the first member (no inviter)", () => {
    const drafts = draftNotifications(
      { id: "e1", type: "member_joined", actor_id: "aki", payload: { invited_by: null } },
      members,
    );
    expect(drafts.map((draft) => draft.body)).toEqual(["", ""]);
  });

  it("sends nothing for event types without a rule yet", () => {
    expect(draftNotifications({ id: "e1", type: "submitted", actor_id: "aki", payload: {} }, members)).toEqual([]);
  });
});

describe("classifyPushStatus", () => {
  it("treats 404/410 as a dead subscription", () => {
    expect(classifyPushStatus(201)).toBe("ok");
    expect(classifyPushStatus(404)).toBe("gone");
    expect(classifyPushStatus(410)).toBe("gone");
    expect(classifyPushStatus(429)).toBe("failed");
    expect(classifyPushStatus(500)).toBe("failed");
    expect(classifyPushStatus(undefined)).toBe("failed");
  });
});

describe("draftNotifications (M4)", () => {
  const recipientsOf = (type: string, actor: string, payload: Record<string, unknown> = {}) =>
    draftNotifications({ id: "e", type, actor_id: actor, payload }, members).map((draft) => draft.recipientId);

  it("tells the others about a declaration, with the deadline", () => {
    const [first] = draftNotifications(
      {
        id: "e",
        type: "declared",
        actor_id: "aki",
        payload: { declaration: "演習 10 問", target_end_time: "2026-10-20T12:00:00Z" },
      },
      members,
    );
    expect(recipientsOf("declared", "aki", { declaration: "x", target_end_time: "2026-10-20T12:00:00Z" })).toEqual([
      "ben",
      "cho",
    ]);
    expect(first.body).toBe("「演習 10 問」（締切 21:00）");
  });

  it("asks the owner to rewrite a flagged declaration, and tells the rest", () => {
    const drafts = draftNotifications(
      {
        id: "e",
        type: "declaration_flagged",
        actor_id: "ben",
        payload: { owner_id: "aki", comment: "軽い", revision_due_at: "2026-10-20T02:00:00Z" },
      },
      members,
    );
    expect(drafts.map((d) => [d.recipientId, d.requiresAction])).toEqual([
      ["aki", true],
      ["cho", false],
    ]);
    expect(drafts[0].body).toBe("軽い ／ 11:00 までに書き直してください");
  });

  it("shows trial penalties as 本番なら", () => {
    const [draft] = draftNotifications(
      { id: "e", type: "revision_expired", actor_id: "aki", payload: { points: 500, waived: "trial" } },
      members,
    );
    expect(draft.body).toBe("お試し期間なので本番なら 500 円");
    expect(recipientsOf("revision_expired", "aki", { points: 500 })).toEqual(["aki", "ben", "cho"]);
  });

  it("sends leave requests only to the fixed reviewers, and votes only to the owner", () => {
    expect(
      recipientsOf("leave_requested", "aki", {
        start_date: "2026-10-22",
        end_date: "2026-10-28",
        reason: "テスト",
        review_due_at: "2026-10-20T14:59:00Z",
        reviewer_ids: ["ben"],
      }),
    ).toEqual(["ben"]);
    expect(
      recipientsOf("review_vote_cast", "ben", { subject_type: "leave", owner_id: "aki", verdict: "accept", accepted: 1, total: 2 }),
    ).toEqual(["aki"]);
  });
});
