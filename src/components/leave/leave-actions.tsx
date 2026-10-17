"use client";

import { useState, useTransition } from "react";
import { cancelLeave, reviewLeave } from "@/actions/leave";
import { ActionButton } from "@/components/brand/action-button";
import { TextArea } from "@/components/form/fields";
import { FieldError } from "@/components/form/submit-button";

/** Approve or reject someone's leave request (everyone else must approve). */
export function LeaveReview({ leaveRequestId }: { leaveRequestId: string }) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function decide(verdict: "accept" | "reject") {
    setError(undefined);
    startTransition(async () => {
      const result = await reviewLeave({ leaveRequestId, verdict, comment });
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="grid gap-2">
      <TextArea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={300}
        aria-label="ひとこと（任意）"
        placeholder="ひとこと（任意）"
        className="min-h-14 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <ActionButton type="button" tone="mint" disabled={pending} onClick={() => decide("accept")} className="py-2 text-base">
          承認する
        </ActionButton>
        <ActionButton type="button" tone="white" disabled={pending} onClick={() => decide("reject")} className="py-2 text-base">
          却下する
        </ActionButton>
      </div>
      <FieldError id={`review-${leaveRequestId}`} message={error} />
    </div>
  );
}

/** Withdraw a request, or end an approved leave from tomorrow. */
export function CancelLeave({ leaveRequestId, label }: { leaveRequestId: string; label: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await cancelLeave(leaveRequestId);
            setError(result.error);
          })
        }
        className="justify-self-start text-sm font-bold text-red underline underline-offset-2 disabled:opacity-50"
      >
        {pending ? "処理中…" : label}
      </button>
      <FieldError id={`cancel-${leaveRequestId}`} message={error} />
    </div>
  );
}
