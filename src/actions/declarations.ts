"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { dispatchAfterResponse } from "@/lib/notify";
import { generatePassphrase } from "@/lib/passphrase";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors } from "@/lib/validation/profile";

// Declarations (F3), "too light" (F3b). Rules are checked by the RPCs; this validates shape only.

const declaration = z.string().trim().min(1, "宣言の内容を書いてください").max(500, "500 文字以内にしてください");

export type FormState = { errors?: Record<string, string>; values?: Record<string, string>; done?: boolean };

const declareSchema = z.object({ declaration });

export async function declareGoal(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values = { declaration: String(formData.get("declaration") ?? "") };
  const parsed = declareSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { data: event, error } = await createAdminClient().rpc("declare_goal", {
    p_user_id: member.id,
    p_declaration: parsed.data.declaration,
    // The deadline is tomorrow's cutoff (ADR-032); the RPC ignores this argument.
    p_end_time: null as unknown as string,
    p_passphrase: generatePassphrase(),
  });
  if (error) return failed(error, values);

  dispatchAfterResponse(event);
  refresh();
  return { done: true };
}

/** 「できなかった」: closes the member's open day as missed, then on to the reason report. */
export async function giveUpDay(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const logId = z.uuid().safeParse(String(formData.get("logId") ?? ""));
  if (!logId.success) return { errors: { form: GENERIC_ERROR } };

  const admin = createAdminClient();
  const { data: event, error } = await admin.rpc("give_up_day", {
    p_user_id: member.id,
    p_study_log_id: logId.data,
  });
  if (error) return failed(error, {});

  dispatchAfterResponse(event);
  // A makeup session (補習) just ends; a study day goes on to the reason report.
  const { data: log } = await admin.from("study_logs").select("is_makeup").eq("id", logId.data).single();
  redirect(log?.is_makeup ? "/makeup" : `/reports/${logId.data}`);
}

const flagSchema = z.object({
  logId: z.uuid(),
  comment: z.string().trim().min(1, "どこが軽いのか書いてください").max(300, "300 文字以内にしてください"),
});

export async function flagDeclaration(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values = { logId: String(formData.get("logId") ?? ""), comment: String(formData.get("comment") ?? "") };
  const parsed = flagSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { data: event, error } = await createAdminClient().rpc("flag_declaration", {
    p_flagger_id: member.id,
    p_study_log_id: parsed.data.logId,
    p_comment: parsed.data.comment,
  });
  if (error) return failed(error, values);

  dispatchAfterResponse(event);
  refresh();
  return { done: true };
}

const reviseSchema = z.object({ logId: z.uuid(), declaration });

export async function reviseDeclaration(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values = {
    logId: String(formData.get("logId") ?? ""),
    declaration: String(formData.get("declaration") ?? ""),
  };
  const parsed = reviseSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { data: event, error } = await createAdminClient().rpc("revise_declaration", {
    p_user_id: member.id,
    p_study_log_id: parsed.data.logId,
    p_declaration: parsed.data.declaration,
  });
  if (error) return failed(error, values);

  dispatchAfterResponse(event);
  refresh();
  return { done: true };
}

function failed(error: { message: string }, values: Record<string, string>): FormState {
  const message = rpcErrorMessage(error);
  if (!message) console.error("declaration rpc failed", error);
  return { errors: { form: message ?? GENERIC_ERROR }, values };
}
