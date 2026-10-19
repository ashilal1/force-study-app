"use client";

import { useState, useTransition } from "react";
import { assignPayee, updateSettlement } from "@/actions/settlements";
import { ActionButton } from "@/components/brand/action-button";
import { FieldError } from "@/components/form/submit-button";
import { cn } from "@/lib/utils";

type Step = "sent" | "received" | "not_received";

const LABEL: Record<Step, string> = {
  sent: "送金した",
  received: "受け取った",
  not_received: "届いていない",
};

/** One or two settlement steps as buttons (送金した / 受け取った・届いていない). */
export function SettlementButtons({ settlementId, steps }: { settlementId: string; steps: Step[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="grid gap-1.5">
      <div className={cn("grid gap-2", steps.length > 1 && "grid-cols-2")}>
        {steps.map((step) => (
          <ActionButton
            key={step}
            type="button"
            tone={step === "not_received" ? "white" : "mint"}
            disabled={pending}
            className="py-2 text-base"
            onClick={() => startTransition(async () => setError((await updateSettlement(settlementId, step)).error))}
          >
            {pending ? "送信中…" : LABEL[step]}
          </ActionButton>
        ))}
      </div>
      <FieldError id={`settlement-${settlementId}`} message={error} />
    </div>
  );
}

/** Admin: who pays whom (decided by the group). Changing it notifies everyone. */
export function PayeeSelect({
  userId,
  current,
  options,
}: {
  userId: string;
  current: string | null;
  options: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="grid gap-1">
      <select
        defaultValue={current ?? ""}
        disabled={pending}
        aria-label="支払先"
        onChange={(event) => {
          const payee = event.target.value;
          if (!payee) return;
          startTransition(async () => setError((await assignPayee(userId, payee)).error));
        }}
        className="th-field rounded-[10px] border-[2.5px] border-ink bg-card px-2 py-1.5 text-sm font-bold"
      >
        <option value="" disabled>
          未設定
        </option>
        {options
          .filter((option) => option.id !== userId)
          .map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
      </select>
      <FieldError id={`payee-${userId}`} message={error} />
    </div>
  );
}
