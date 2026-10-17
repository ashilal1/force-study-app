"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormState } from "./declarations";

const noteSchema = z.object({ weekEnd: z.iso.date(), note: z.string().max(4000, "4000 文字以内にしてください") });

/** The member's own note on a weekly review (the only part they can keep editing). */
export async function saveWeeklyNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values = { weekEnd: String(formData.get("weekEnd") ?? ""), note: String(formData.get("note") ?? "") };
  const parsed = noteSchema.safeParse(values);
  if (!parsed.success) return { errors: { form: parsed.error.issues[0]?.message ?? GENERIC_ERROR }, values };

  const { error } = await createAdminClient().rpc("save_weekly_note", {
    p_user_id: member.id,
    p_week_end: parsed.data.weekEnd,
    p_note: parsed.data.note,
  });
  if (error) {
    const message = rpcErrorMessage(error);
    if (!message) console.error("save_weekly_note failed", error);
    return { errors: { form: message ?? GENERIC_ERROR }, values };
  }
  refresh();
  return { done: true, values };
}
