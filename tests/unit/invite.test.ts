import { describe, expect, it } from "vitest";
import { formatInviteCode, generateInviteCode, hashInviteCode, normalizeInviteCode } from "@/lib/invite";
import { safeNextPath } from "@/lib/redirect";

describe("invite codes", () => {
  it("are 10 characters without look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateInviteCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{10}$/);
    }
  });

  it("do not repeat", () => {
    const codes = new Set(Array.from({ length: 1000 }, generateInviteCode));
    expect(codes.size).toBe(1000);
  });

  it("are formatted in groups of four", () => {
    expect(formatInviteCode("K7QM3XRPWD")).toBe("K7QM-3XRP-WD");
  });

  it("hash the same however they are typed", () => {
    const hash = hashInviteCode("K7QM-3XRP-WD");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteCode("k7qm 3xrp wd")).toBe(hash);
    expect(hashInviteCode("K7QM3XRPWD")).toBe(hash);
    expect(hashInviteCode("K7QM3XRPWE")).not.toBe(hash);
    expect(normalizeInviteCode(" k7qm-3xrp-wd ")).toBe("K7QM3XRPWD");
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeNextPath("/join?code=K7QM-3XRP-WD")).toBe("/join?code=K7QM-3XRP-WD");
    expect(safeNextPath("/settings")).toBe("/settings");
  });

  it("rejects anything that could leave the site", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "evil", "", null, undefined, 1]) {
      expect(safeNextPath(value)).toBeNull();
    }
  });
});
