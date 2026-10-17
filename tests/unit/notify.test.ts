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
    expect(draftNotifications({ id: "e1", type: "declared", actor_id: "aki", payload: {} }, members)).toEqual([]);
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
