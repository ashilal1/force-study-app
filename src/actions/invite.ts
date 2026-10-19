"use server";

import { headers } from "next/headers";
import { requireMember } from "@/lib/auth";
import { formatInviteCode, generateInviteCode, hashInviteCode } from "@/lib/invite";
import { createAdminClient } from "@/lib/supabase/admin";

export type InviteState =
  | { status: "idle" }
  | { status: "issued"; code: string; url: string; expiresAt: string }
  | { status: "error"; message: string };

const INVITE_ERRORS: Record<string, string> = {
  group_full: "グループが満員なので、これ以上招待できません",
  not_a_member: "メンバーだけが招待できます",
};

/**
 * Issues a single-use invite (ADR-026). The plain code exists only in this response; the database
 * keeps its hash, so a closed screen means issuing a new one.
 */
export async function createInvite(): Promise<InviteState> {
  const member = await requireMember();
  const code = generateInviteCode();

  const { data: invite, error } = await createAdminClient().rpc("create_invite", {
    p_user_id: member.id,
    p_code_hash: hashInviteCode(code),
  });
  if (error) {
    const message = INVITE_ERRORS[error.message];
    if (!message) console.error("create_invite failed", error);
    return { status: "error", message: message ?? "招待を作れませんでした。時間をおいてもう一度試してください" };
  }

  // Server Actions always carry Origin (Next.js checks it against Host).
  const origin = (await headers()).get("origin") ?? "";
  const formatted = formatInviteCode(code);
  return {
    status: "issued",
    code: formatted,
    // openExternalBrowser=1: LINE opens the link in Safari / Chrome, where Google sign-in works (F15).
    url: `${origin}/join?code=${formatted}&openExternalBrowser=1`,
    expiresAt: invite.expires_at,
  };
}
