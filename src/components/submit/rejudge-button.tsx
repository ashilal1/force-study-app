"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { judgeMySubmission } from "@/actions/submissions";
import { ActionButton } from "@/components/brand/action-button";
import { FieldError } from "@/components/form/submit-button";

/** Re-runs the AI judgement for a submission that errored (or was left judging). Doesn't use an attempt. */
export function RejudgeButton({ submissionId, label = "もう一度判定する" }: { submissionId: string; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="grid gap-1.5">
      <ActionButton
        type="button"
        tone="tape"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            const outcome = await judgeMySubmission(submissionId);
            if (outcome.status === "error") setError("まだ判定できませんでした。少し待ってからもう一度押してください");
            if (outcome.status === "waiting_revision") setError("宣言の書き直しが終わってから判定します");
            router.refresh();
          })
        }
        hint="試行回数は使いません"
      >
        {pending ? "AI が判定中…" : label}
      </ActionButton>
      <FieldError id={`rejudge-${submissionId}`} message={error} />
    </div>
  );
}
