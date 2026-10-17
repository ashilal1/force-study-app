"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { dispatchAfterResponse } from "@/lib/notify";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";

// Weekly settlement (F8): 送金した / 受け取った / 届いていない, and payees (admins only).

type Step = "sent" | "received" | "not_received";

const RPC = {
  sent: "mark_settlement_sent",
  received: "confirm_settlement",
  not_received: "report_not_received",
} as const;

export async function updateSettlement(settlementId: string, step: Step): Promise<{ error?: string }> {
  const member = await requireMember();
  if (!z.uuid().safeParse(settlementId).success || !(step in RPC)) return { error: GENERIC_ERROR };

  const admin = createAdminClient();
  const { data: event, error } =
    step === "sent"
      ? await admin.rpc(RPC.sent, { p_debtor_id: member.id, p_settlement_id: settlementId })
      : await admin.rpc(RPC[step], { p_payee_id: member.id, p_settlement_id: settlementId });
  if (error) return { error: messageFor(error) };
  dispatchAfterResponse(event);
  refresh();
  return {};
}

export async function assignPayee(userId: string, payeeId: string): Promise<{ error?: string }> {
  const member = await requireMember();
  if (!z.uuid().safeParse(userId).success || !z.uuid().safeParse(payeeId).success) return { error: GENERIC_ERROR };
  const { data: event, error } = await createAdminClient().rpc("assign_payee", {
    p_admin_id: member.id,
    p_user_id: userId,
    p_payee_id: payeeId,
  });
  if (error) return { error: messageFor(error) };
  dispatchAfterResponse(event);
  refresh();
  return {};
}

function messageFor(error: { message: string }): string {
  const message = rpcErrorMessage(error);
  if (!message) console.error("settlement rpc failed", error);
  return message ?? GENERIC_ERROR;
}
