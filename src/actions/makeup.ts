"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { dispatchAfterResponse } from "@/lib/notify";
import { generatePassphrase } from "@/lib/passphrase";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors } from "@/lib/validation/profile";
import type { FormState } from "./declarations";

// Makeup study (補習, F8b). declare_makeup checks that something is owed and one session a day;
// submissions, 「軽すぎる」, 「できなかった」 and 「怪しい」 use the same actions as a study day.

const declareSchema = z.object({
  declaration: z.string().trim().min(1, "補習でやることを書いてください").max(500, "500 文字以内にしてください"),
});

export async function declareMakeup(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values = { declaration: String(formData.get("declaration") ?? "") };
  const parsed = declareSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { data: event, error } = await createAdminClient().rpc("declare_makeup", {
    p_user_id: member.id,
    p_declaration: parsed.data.declaration,
    p_passphrase: generatePassphrase(),
  });
  if (error) {
    const message = rpcErrorMessage(error);
    if (!message) console.error("declare_makeup failed", error);
    return { errors: { form: message ?? GENERIC_ERROR }, values };
  }

  dispatchAfterResponse(event);
  refresh();
  return { done: true };
}
