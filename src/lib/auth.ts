import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

// Data access layer for "who is this?" (ADR-025). Signing in with Google makes a session user;
// only people who entered the invite code have a profile and count as members.
// Every Server Action re-checks through these instead of trusting the page that rendered the form.

export type SessionUser = {
  id: string;
  email: string | null;
  /** Name and photo from the Google account, used as defaults when joining. */
  googleName: string | null;
  googleAvatarUrl: string | null;
};

export type Member = Pick<
  Tables<"profiles">,
  "id" | "display_name" | "avatar_url" | "paypay_link" | "is_admin" | "trial_ends_at" | "notifications_verified_at"
>;

/** The signed-in user from the verified JWT, or null. Deduplicated per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const metadata = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
  return {
    id: claims.sub,
    email: text(claims.email),
    googleName: text(metadata.full_name) ?? text(metadata.name),
    googleAvatarUrl: text(metadata.avatar_url) ?? text(metadata.picture),
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The caller's profile, read through RLS. RLS only shows rows to members, so a signed-in user who
 * hasn't joined (or was deactivated) gets null here.
 */
export const getMember = cache(async (): Promise<Member | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, paypay_link, is_admin, trial_ends_at, notifications_verified_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
});

/**
 * Notification gate, server half (F0): the member confirmed a test notification on at least one
 * device that is still registered. The client half (NotificationGuard) checks the current device.
 */
export const hasConfirmedNotifications = cache(async (member: Member): Promise<boolean> => {
  if (!member.notifications_verified_at) return false;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", member.id)
    .not("verified_at", "is", null)
    .limit(1);
  if (error) throw error;
  return data.length > 0;
});

export async function requireMember(): Promise<Member> {
  const user = await requireUser();
  const member = await getMember();
  if (!member || member.id !== user.id) redirect("/join");
  return member;
}
