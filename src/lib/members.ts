import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type MemberSummary = Pick<Tables<"profiles">, "id" | "display_name" | "avatar_url" | "is_admin">;

/** Active members in join order, read through RLS (so only members get rows back). */
export async function listMembers(): Promise<MemberSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, is_admin")
    .is("deactivated_at", null)
    .order("created_at");
  if (error) throw error;
  return data;
}

/** True while the member is in the trial week (penalties are shown but not charged). */
export function isInTrial(trialEndsAt: string, now: Date = new Date()): boolean {
  return new Date(trialEndsAt).getTime() > now.getTime();
}
