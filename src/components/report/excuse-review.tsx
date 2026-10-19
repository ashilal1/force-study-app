"use client";

import { useState, useTransition } from "react";
import { reviewExcuse } from "@/actions/reports";
import { ActionButton } from "@/components/brand/action-button";
import { TextArea } from "@/components/form/fields";
import { FieldError } from "@/components/form/submit-button";

/** F7: 納得 or 納得できない (one 納得できない rejects at once). A comment is optional. */
export function ExcuseReview({ logId }: { logId: string }) {
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function decide(verdict: "accept" | "reject") {
    setError(undefined);
    startTransition(async () => setError((await reviewExcuse({ logId, verdict, comment })).error));
  }

  return (
    <div className="grid gap-2">
      <TextArea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={300}
        aria-label="ひとこと（任意）"
        placeholder="ひとこと（任意。本人に届きます）"
        className="min-h-14 text-sm"
      />
      <div data-tip="review" className="grid grid-cols-2 gap-2">
        <ActionButton type="button" tone="mint" disabled={pending} onClick={() => decide("accept")} className="py-2 text-base">
          納得
        </ActionButton>
        <ActionButton type="button" tone="white" disabled={pending} onClick={() => decide("reject")} className="py-2 text-base">
          納得できない
        </ActionButton>
      </div>
      <p className="m-0 text-xs text-sub">1 人でも「納得できない」を押したら、その場で却下になります。押したら変えられません。</p>
      <FieldError id={`excuse-review-${logId}`} message={error} />
    </div>
  );
}
