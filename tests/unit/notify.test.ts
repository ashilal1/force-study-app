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
    expect(draftNotifications({ id: "e1", type: "trial_ending_unruled", actor_id: "aki", payload: {} }, members)).toEqual([]);
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

describe("draftNotifications (M5a)", () => {
  it("asks the owner to resubmit after a rejection while attempts remain", () => {
    const drafts = draftNotifications(
      {
        id: "e",
        type: "judged_rejected",
        actor_id: "aki",
        payload: { score: 55, passphrase_found: false, feedback: "量が少ない", attempts_left: 2, deadline: "2026-10-20T12:00:00Z" },
      },
      members,
    );
    expect(drafts[0]).toMatchObject({
      recipientId: "aki",
      requiresAction: true,
      body: "合言葉が見つかりませんでした。量が少ない ／ 残り 2 回（締切 21:00）",
    });
    expect(drafts.slice(1).map((d) => d.body)).toEqual(["残り 2 回", "残り 2 回"]);
  });

  it("tells everyone about a pass with the dispute window", () => {
    const drafts = draftNotifications(
      { id: "e", type: "judged_passed", actor_id: "aki", payload: { score: 85, dispute_window_ends_at: "2026-10-20T07:00:00Z" } },
      members,
    );
    expect(drafts.map((d) => [d.recipientId, d.title])).toEqual([
      ["aki", "合格しました（85 点）"],
      ["ben", "あき さんが合格しました（85 点）"],
      ["cho", "あき さんが合格しました（85 点）"],
    ]);
    expect(drafts[1].body).toBe("怪しければ 16:00 までに指摘できます");
  });
});

describe("draftNotifications (M5b)", () => {
  it("asks the owner to resend and links to the day", () => {
    const drafts = draftNotifications(
      {
        id: "e",
        type: "submission_flagged",
        actor_id: "ben",
        study_log_id: "log-1",
        payload: { owner_id: "aki", comment: "昨日の写真に見える", resend_due_at: "2026-10-20T06:00:00Z" },
      },
      members,
    );
    expect(drafts.map((d) => [d.recipientId, d.requiresAction, d.url])).toEqual([
      ["aki", true, "/logs/log-1"],
      ["cho", false, "/logs/log-1"],
    ]);
    expect(drafts[0].body).toBe("昨日の写真に見える ／ 15:00 までなら何度でも証拠を送り直せます");
  });

  it("tells only the active flaggers about resent evidence", () => {
    const drafts = draftNotifications(
      { id: "e", type: "evidence_resent", actor_id: "aki", payload: { score: 90, passphrase_found: true, flagger_ids: ["cho"] } },
      members,
    );
    expect(drafts.map((d) => [d.recipientId, d.body])).toEqual([["cho", "AI: 90 点・合言葉あり。納得したら取り下げてください"]]);
  });

  it("sends the final review to the fixed reviewers and P8 to everyone", () => {
    expect(
      draftNotifications(
        { id: "e", type: "dispute_final_review_started", actor_id: "aki", payload: { review_due_at: "2026-10-20T14:59:00Z", reviewer_ids: ["ben"] } },
        members,
      ).map((d) => [d.recipientId, d.requiresAction]),
    ).toEqual([
      ["ben", true],
      ["aki", false],
    ]);
    const [invalidated] = draftNotifications(
      { id: "e", type: "dispute_invalidated", actor_id: "aki", payload: { rejected_by: "ben", comment: "合言葉が無い", points: 200 } },
      members,
    );
    expect(invalidated.body).toBe("べん さん: 合言葉が無い ／ 200 円");
  });
});

describe("draftNotifications (M6)", () => {
  it("reminds only the member who hasn't declared, with the cutoff and penalty", () => {
    const [draft, ...rest] = draftNotifications(
      { id: "e", type: "reminder_declare_last_call", actor_id: "ben", payload: { cutoff: "2026-10-20T03:00:00Z", points: 500 } },
      members,
    );
    expect(rest).toEqual([]);
    expect(draft).toMatchObject({
      recipientId: "ben",
      title: "宣言の締切まであと 1 時間（12:00）",
      body: "過ぎると宣言なしになり、500 円",
      url: "/declare",
      requiresAction: true,
    });
  });

  it("asks for a report after a miss and tells the others", () => {
    const drafts = draftNotifications(
      { id: "e", type: "missed", actor_id: "aki", study_log_id: "log-1", payload: { report_due_at: "2026-10-20T14:00:00Z" } },
      members,
    );
    expect(drafts.map((d) => [d.recipientId, d.requiresAction])).toEqual([
      ["aki", true],
      ["ben", false],
      ["cho", false],
    ]);
    expect(drafts[0].body).toContain("23:00 までに理由を申告");
    expect(drafts[0].url).toBe("/reports/log-1");
  });

  it("sends review reminders to the reviewer, linking the right page", () => {
    const [leave] = draftNotifications(
      { id: "e", type: "reminder_review_due", actor_id: "ben", payload: { subject_type: "leave", owner_id: "aki", review_due_at: "2026-10-20T14:59:00Z" } },
      members,
    );
    expect(leave).toMatchObject({ recipientId: "ben", url: "/leave", body: "今日 23:59 まで" });
  });
});

describe("draftNotifications (M7a)", () => {
  it("sends excuses to the fixed reviewers, other reports to everyone else", () => {
    const review = draftNotifications(
      {
        id: "e",
        type: "review_requested",
        actor_id: "aki",
        study_log_id: "log-1",
        payload: { text: "急に入院", review_due_at: "2026-10-20T14:59:00Z", reviewer_ids: ["ben"] },
      },
      members,
    );
    expect(review.map((d) => [d.recipientId, d.requiresAction, d.url])).toEqual([["ben", true, "/reports/log-1"]]);
    expect(
      draftNotifications({ id: "e", type: "reported", actor_id: "aki", payload: { category: "other" } }, members),
    ).toEqual([]);
    const slacked = draftNotifications(
      { id: "e", type: "reported", actor_id: "aki", payload: { category: "slacked", points: 700, text: "" } },
      members,
    );
    expect(slacked.map((d) => [d.recipientId, d.title])).toEqual([
      ["ben", "あき さん: サボった（700 円）"],
      ["cho", "あき さん: サボった（700 円）"],
    ]);
  });

  it("explains an expired excuse review", () => {
    const [draft] = draftNotifications(
      { id: "e", type: "review_rejected", actor_id: "aki", payload: { expired: true, points: 500 } },
      members,
    );
    expect(draft.body).toBe("期限までに全員の納得がそろいませんでした。500 円");
  });
});

describe("draftNotifications (M7b)", () => {
  it("tells the debtor to pay and the payee what's coming", () => {
    const drafts = draftNotifications(
      { id: "e", type: "settlement_created", actor_id: "aki", payload: { payee_id: "ben", amount: 1200 } },
      members,
    );
    expect(drafts.map((d) => [d.recipientId, d.title, d.requiresAction])).toEqual([
      ["aki", "べん さんに 1,200 円 送ってください", true],
      ["ben", "あき さんから 1,200 円 届きます", false],
    ]);
  });

  it("lists the week's ranking for everyone", () => {
    const drafts = draftNotifications(
      { id: "e", type: "weekly_summary", actor_id: null, payload: { ranking: [{ user_id: "aki", amount: 1200 }, { user_id: "cho", amount: 500 }] } },
      members,
    );
    expect(drafts).toHaveLength(3);
    expect(drafts[0].body).toBe("あき 1,200円、ちょう 500円");
  });
});

describe("draftNotifications (M8a)", () => {
  it("lists changed settings with labels and units", () => {
    const [draft] = draftNotifications(
      { id: "e", type: "settings_changed", actor_id: "aki", payload: { changes: { penalty_slacked: 1000, declaration_cutoff: "11:30:00", passing_score: 75 } } },
      members,
    );
    expect(draft.body).toBe("サボり・申告なし（P2・P5）: 1000、宣言の締切: 11:30、合格点: 75点");
  });
});

describe("draftNotifications (M8c)", () => {
  it("tells each member their own weekly review is ready", () => {
    const drafts = draftNotifications(
      { id: "e", type: "weekly_review_created", actor_id: "ben", payload: { week_end: "2026-10-24", completed: 5, counted: 6 } },
      members,
    );
    expect(drafts.map((d) => [d.recipientId, d.title, d.url])).toEqual([
      ["ben", "今週の振り返りができました（達成 5/6）", "/members/ben/weeks/2026-10-24"],
    ]);
  });
});
