"use client";

import { useState, useTransition } from "react";
import { reviewDispute, withdrawFlag } from "@/actions/disputes";
import { ActionButton } from "@/components/brand/action-button";
import { TextArea } from "@/components/form/fields";
import { FieldError } from "@/components/form/submit-button";

/** The flagger is convinced by the resent evidence. When every flagger withdraws, the day stands. */
export function WithdrawFlagButton({ logId }: { logId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="grid gap-1">
      <ActionButton
        type="button"
        tone="mint"
        disabled={pending}
        onClick={() => startTransition(async () => setError((await withdrawFlag(logId)).error))}
        hint="全員が取り下げたら達成で確定します"
      >
        {pending ? "送信中…" : "納得したので取り下げる"}
      </ActionButton>
      <FieldError id={`withdraw-${logId}`} message={error} />
    </div>
  );
}

/** Final review: accept, or reject with a reason (one reasoned reject invalidates the day, P8). */
export function DisputeReview({ logId }: { logId: string }) {
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function decide(verdict: "accept" | "reject") {
    if (verdict === "reject" && !comment.trim()) {
      setError("却下するときは理由を書いてください");
      return;
    }
    setError(undefined);
    startTransition(async () => setError((await reviewDispute({ logId, verdict, comment })).error));
  }

  return (
    <div className="grid gap-2">
      <TextArea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={300}
        aria-label="理由"
        placeholder="却下するときは理由を必ず書く（本人に見せます）"
        className="min-h-16 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <ActionButton type="button" tone="mint" disabled={pending} onClick={() => decide("accept")} className="py-2 text-base">
          認める
        </ActionButton>
        <ActionButton type="button" tone="red" disabled={pending} onClick={() => decide("reject")} className="py-2 text-base">
          却下する
        </ActionButton>
      </div>
      <FieldError id={`dispute-review-${logId}`} message={error} />
    </div>
  );
}
