"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { dispatchAfterResponse } from "@/lib/notify";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors, groupNameSchema } from "@/lib/validation/profile";
import type { FormState } from "./declarations";

// Admin (M10): rename the group, and add or remove admins. The RPCs check the admin flag, the
// group and that at least one admin remains.

export async function renameGroup(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values = { name: String(formData.get("name") ?? "") };
  const parsed = z.object({ name: groupNameSchema }).safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { data: event, error } = await createAdminClient().rpc("rename_group", { p_admin_id: member.id, p_name: parsed.data.name });
  if (error) return failed(error, values);
  dispatchAfterResponse(event);
  refresh();
  return { done: true };
}

export async function setAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const parsed = z
    .object({ userId: z.uuid(), isAdmin: z.enum(["true", "false"]) })
    .safeParse({ userId: formData.get("userId"), isAdmin: formData.get("isAdmin") });
  if (!parsed.success) return { errors: { form: GENERIC_ERROR } };

  const { data: event, error } = await createAdminClient().rpc("set_admin", {
    p_admin_id: member.id,
    p_user_id: parsed.data.userId,
    p_is_admin: parsed.data.isAdmin === "true",
  });
  if (error) return failed(error, {});
  dispatchAfterResponse(event);
  refresh();
  return { done: true };
}

function failed(error: { message: string }, values: Record<string, string>): FormState {
  const message = rpcErrorMessage(error);
  if (!message) console.error("group admin rpc failed", error);
  return { errors: { form: message ?? GENERIC_ERROR }, values };
}
