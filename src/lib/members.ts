import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type MemberSummary = Pick<Tables<"profiles">, "id" | "display_name" | "avatar_url" | "is_admin">;

/** Active members in join order, read through RLS (so only members get rows back). Deduplicated per request. */
export const listMembers = cache(async (): Promise<MemberSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, is_admin")
    .is("deactivated_at", null)
    .order("created_at");
  if (error) throw error;
  return data;
});

/** Upper bound on active members (group_settings.max_members). */
export async function getMaxMembers(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("group_settings").select("max_members").single();
  if (error) throw error;
  return data.max_members;
}

/** True while the member is in the trial week (penalties are shown but not charged). */
export function isInTrial(trialEndsAt: string, now: Date = new Date()): boolean {
  return new Date(trialEndsAt).getTime() > now.getTime();
}
