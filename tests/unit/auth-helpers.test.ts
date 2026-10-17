import { describe, expect, it } from "vitest";
import { isInTrial } from "@/lib/members";
import { secureEqual } from "@/lib/secure-compare";
import { joinSchema, profileSchema } from "@/lib/validation/profile";

describe("secureEqual", () => {
  it("matches only the exact string", () => {
    expect(secureEqual("study-2026", "study-2026")).toBe(true);
    expect(secureEqual("study-2025", "study-2026")).toBe(false);
    expect(secureEqual("study", "study-2026")).toBe(false);
    expect(secureEqual("", "study-2026")).toBe(false);
  });
});

describe("joinSchema", () => {
  it("trims the code and display name", () => {
    const parsed = joinSchema.parse({ code: "  abcd ", displayName: "  あき  ", avatar: "google" });
    expect(parsed).toEqual({ code: "abcd", displayName: "あき", avatar: "google" });
  });

  it("requires a code and a display name", () => {
    const result = joinSchema.safeParse({ code: " ", displayName: "   ", avatar: "initial" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(["code", "displayName"]);
  });

  it("counts characters, not UTF-16 units, like the database check", () => {
    const thirty = "😀".repeat(30);
    expect(joinSchema.safeParse({ code: "x", displayName: thirty, avatar: "initial" }).success).toBe(true);
    expect(joinSchema.safeParse({ code: "x", displayName: `${thirty}a`, avatar: "initial" }).success).toBe(false);
  });

  it("rejects unknown avatar choices", () => {
    expect(joinSchema.safeParse({ code: "x", displayName: "a", avatar: "https://evil.example" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  const base = { displayName: "あき", avatar: "initial" };

  it("treats an empty PayPay link as none", () => {
    expect(profileSchema.parse({ ...base, paypayLink: "  " }).paypayLink).toBeNull();
  });

  it("accepts https links and rejects anything else", () => {
    expect(profileSchema.parse({ ...base, paypayLink: "https://qr.paypay.ne.jp/p2p01_abc" }).paypayLink).toBe(
      "https://qr.paypay.ne.jp/p2p01_abc",
    );
    expect(profileSchema.safeParse({ ...base, paypayLink: "http://qr.paypay.ne.jp/x" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, paypayLink: "javascript:alert(1)" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, paypayLink: "paypay" }).success).toBe(false);
  });
});

describe("isInTrial", () => {
  const endsAt = "2026-10-18T15:00:00Z"; // Sunday 0:00 JST

  it("is true until the trial ends and false from then on", () => {
    expect(isInTrial(endsAt, new Date("2026-10-18T14:59:59Z"))).toBe(true);
    expect(isInTrial(endsAt, new Date("2026-10-18T15:00:00Z"))).toBe(false);
  });
});
