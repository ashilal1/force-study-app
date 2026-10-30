"use client";

import { useState, useTransition } from "react";
import { appealJudgement, reviewAppeal } from "@/actions/appeals";
import { ActionButton } from "@/components/brand/action-button";
import { TextArea } from "@/components/form/fields";
import { FieldError } from "@/components/form/submit-button";

/** After the last rejected attempt: ask the other members to judge the day instead (F5c). */
export function AppealForm({ logId, minChars }: { logId: string; minChars: number }) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const short = reason.trim().length < minChars;

  function submit() {
    if (short) {
      setError(`${minChars} 文字以上で書いてください（いま ${reason.trim().length} 文字）`);
      return;
    }
    setError(undefined);
    startTransition(async () => setError((await appealJudgement({ logId, reason })).error));
  }

  return (
    <div className="grid gap-2">
      <TextArea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={1000}
        aria-label="合格だと思う理由"
        placeholder="何をどれだけやったか、AI のどこが違うと思うか（例: 3 章の演習を 12 問解いた。写真が暗くて合言葉が読めなかったみたい）"
        className="min-h-24 text-sm"
      />
      <ActionButton type="button" tone="tape" disabled={pending} onClick={submit} hint="ほかの全員が「認める」を押したら達成になります">
        {pending ? "送信中…" : "メンバーに判定してもらう"}
      </ActionButton>
      <FieldError id={`appeal-${logId}`} message={error} />
    </div>
  );
}

/** A reviewer's answer: accept, or reject with a reason (one reasoned reject rejects). */
export function AppealReview({ logId }: { logId: string }) {
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function decide(verdict: "accept" | "reject") {
    if (verdict === "reject" && !comment.trim()) {
      setError("認めないときは理由を書いてください");
      return;
    }
    setError(undefined);
    startTransition(async () => setError((await reviewAppeal({ logId, verdict, comment })).error));
  }

  return (
    <div className="grid gap-2">
      <TextArea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={300}
        aria-label="理由"
        placeholder="認めないときは理由を必ず書く（本人に見せます）"
        className="min-h-16 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <ActionButton type="button" tone="mint" disabled={pending} onClick={() => decide("accept")} className="py-2 text-base">
          認める
        </ActionButton>
        <ActionButton type="button" tone="red" disabled={pending} onClick={() => decide("reject")} className="py-2 text-base">
          認めない
        </ActionButton>
      </div>
      <FieldError id={`appeal-review-${logId}`} message={error} />
    </div>
  );
}
