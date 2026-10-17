"use server";

import { refresh } from "next/cache";
import { requireMember } from "@/lib/auth";
import { dispatchAfterResponse } from "@/lib/notify";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { SETTING_FIELDS } from "@/lib/group-settings";
import type { FormState } from "./declarations";

/** Admin: save the group settings form (F11). The RPC checks the admin flag and every value. */
export async function updateGroupSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values: Record<string, string> = {};
  const changes: Record<string, string | number> = {};
  for (const field of SETTING_FIELDS) {
    const raw = String(formData.get(field.key) ?? "").trim();
    values[field.key] = raw;
    if (raw === "") return { errors: { form: `「${field.label}」を入れてください` }, values };
    changes[field.key] = field.type === "time" ? raw : Number(raw);
  }

  const { data: event, error } = await createAdminClient().rpc("update_group_settings", {
    p_admin_id: member.id,
    p_changes: changes,
  });
  if (error) {
    const message = rpcErrorMessage(error);
    if (!message) console.error("update_group_settings failed", error);
    return { errors: { form: message ?? GENERIC_ERROR }, values };
  }
  if (Object.keys((event.payload as { changes?: object }).changes ?? {}).length > 0) dispatchAfterResponse(event);
  refresh();
  return { done: true };
}
