"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { dispatchAfterResponse } from "@/lib/notify";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";

// Rest days (F2): from tomorrow on, one per Sunday-Saturday week (checked by the RPCs).

const dateSchema = z.iso.date();

export async function setRestDay(date: string, rest: boolean): Promise<{ error?: string }> {
  const member = await requireMember();
  const parsed = dateSchema.safeParse(date);
  if (!parsed.success) return { error: GENERIC_ERROR };

  const { data: event, error } = await createAdminClient().rpc(rest ? "register_rest_day" : "cancel_rest_day", {
    p_user_id: member.id,
    p_date: parsed.data,
  });
  if (error) {
    const message = rpcErrorMessage(error);
    if (!message) console.error("rest day rpc failed", error);
    return { error: message ?? GENERIC_ERROR };
  }

  dispatchAfterResponse(event);
  refresh();
  return {};
}
