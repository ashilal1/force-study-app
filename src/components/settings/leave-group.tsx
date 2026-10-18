"use client";

import { useActionState, useState } from "react";
import { leaveGroup } from "@/actions/group-admin";
import type { FormState } from "@/actions/declarations";
import { ActionButton } from "@/components/brand/action-button";
import { FieldError, SubmitButton } from "@/components/form/submit-button";

/** Leaving the group (ADR-035), with a second step instead of a browser confirm dialog. */
export function LeaveGroup({ groupName }: { groupName: string }) {
  const [state, action] = useActionState<FormState, FormData>(leaveGroup, {});
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <ActionButton type="button" tone="white" onClick={() => setAsking(true)}>
        グループを退会する
      </ActionButton>
    );
  }
  return (
    <form action={action} className="grid gap-2.5 rounded-[12px] border-[2.5px] border-red bg-card px-3.5 py-3">
      <p className="m-0 text-sm leading-relaxed font-bold">「{groupName}」を退会します。</p>
      <ul className="m-0 grid list-disc gap-1 pl-5 text-xs leading-relaxed font-medium">
        <li>これまでの記録はこのグループに残ります（消せません）。</li>
        <li>精算が全部終わっていて、終わっていない日がないときだけ退会できます。</li>
        <li>退会したあと、同じアカウントで別のグループを作ったり、招待コードで入り直したりできます。お試し期間はもうありません。</li>
      </ul>
      <FieldError id="leave-error" message={state.errors?.form} />
      <div className="grid grid-cols-2 gap-2">
        <ActionButton type="button" tone="white" onClick={() => setAsking(false)}>
          やめる
        </ActionButton>
        <SubmitButton tone="red" pendingLabel="退会中…">
          退会する
        </SubmitButton>
      </div>
    </form>
  );
}
