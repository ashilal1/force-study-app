"use client";

import { useActionState } from "react";
import { renameGroup, setAdmin } from "@/actions/group-admin";
import type { FormState } from "@/actions/declarations";
import { Avatar } from "@/components/brand/avatar";
import { FieldLabel, TextInput } from "@/components/form/fields";
import { FieldError, SubmitButton } from "@/components/form/submit-button";

type Member = { id: string; name: string; avatarUrl: string | null; colorIndex: number; isAdmin: boolean; isMe: boolean };

/** Admin (M10): the group's name and who the admins are. */
export function GroupAdmin({ groupName, members }: { groupName: string; members: Member[] }) {
  const [renameState, renameAction] = useActionState<FormState, FormData>(renameGroup, {});
  return (
    <div className="grid gap-5">
      <form action={renameAction} className="grid gap-1.5">
        <FieldLabel htmlFor="group-name">グループ名</FieldLabel>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <TextInput id="group-name" name="name" required maxLength={40} defaultValue={renameState.values?.name ?? groupName} />
          <SubmitButton tone="white" pendingLabel="保存中…" className="w-auto px-4">
            変える
          </SubmitButton>
        </div>
        <FieldError id="group-name-error" message={renameState.errors?.name ?? renameState.errors?.form} />
      </form>

      <div className="grid gap-2">
        <b className="text-sm">管理者</b>
        <p className="m-0 text-xs text-sub">管理者はルールの設定と支払先の入力ができます。何人でもなれますが、0 人にはできません。</p>
        <ul className="m-0 grid list-none gap-2 p-0">
          {members.map((member) => (
            <li key={member.id}>
              <AdminRow member={member} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AdminRow({ member }: { member: Member }) {
  const [state, action] = useActionState<FormState, FormData>(setAdmin, {});
  return (
    <form action={action} className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
      <Avatar name={member.name} src={member.avatarUrl} colorIndex={member.colorIndex} className="size-8 border-2 text-sm" />
      <span className="truncate text-sm font-bold">
        {member.name}
        {member.isMe ? <span className="ml-1 text-xs text-sub">（あなた）</span> : null}
        {member.isAdmin ? <span className="ml-1.5 rounded-full bg-ink px-2 py-0.5 text-[0.7rem] text-white">管理者</span> : null}
      </span>
      <input type="hidden" name="userId" value={member.id} />
      <input type="hidden" name="isAdmin" value={member.isAdmin ? "false" : "true"} />
      <SubmitButton tone="white" pendingLabel="…" className="w-auto px-3 py-1.5 text-xs">
        {member.isAdmin ? (member.isMe ? "管理者をやめる" : "管理者から外す") : "管理者にする"}
      </SubmitButton>
      {state.errors?.form ? <p className="col-span-3 m-0 text-xs font-bold text-red">{state.errors.form}</p> : null}
    </form>
  );
}
