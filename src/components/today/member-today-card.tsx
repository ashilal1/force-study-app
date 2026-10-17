import { Avatar } from "@/components/brand/avatar";
import { Pill } from "@/components/brand/pill";
import { Stamp } from "@/components/brand/stamp";
import { Sticker } from "@/components/brand/sticker";
import { FlagList } from "@/components/declare/flag-list";
import { PassphraseCard } from "@/components/declare/passphrase-card";
import Link from "next/link";
import { actionButtonVariants } from "@/components/brand/action-button";
import { formatJstTime } from "@/lib/time";
import type { TodayLog, TodayMember } from "@/lib/today";
import { FlagForm } from "./flag-form";

/** One member's day on the home board: declaration, deadline, passphrase and flags. */
export function MemberTodayCard({ member }: { member: TodayMember }) {
  const { state } = member;
  return (
    <Sticker className="grid gap-2.5 px-3.5 py-3">
      <div className="grid grid-cols-[44px_1fr_auto] items-center gap-x-3">
        <Avatar name={member.name} src={member.avatarUrl} colorIndex={member.colorIndex} />
        <div className="min-w-0">
          <p className="m-0 truncate font-heading text-[1.2rem] leading-tight">
            {member.name}
            {member.isMe ? <span className="ml-1.5 align-middle text-xs font-bold text-sub">（あなた）</span> : null}
          </p>
          <p className="m-0 truncate text-sm font-bold">{headline(member)}</p>
        </div>
        <Badge member={member} />
      </div>

      {state.kind === "declared" ? (
        <>
          <p className="m-0 text-sm leading-snug font-medium whitespace-pre-wrap">{state.log.declaration}</p>
          {state.log.original_declaration ? (
            <p className="m-0 text-xs text-sub">
              書き直す前: <s>{state.log.original_declaration}</s>
            </p>
          ) : null}
          <PassphraseCard value={state.log.passphrase!} compact />
          <SubmissionLine log={state.log} />
          <FlagList flags={state.log.flags} />
          {member.canFlag ? <FlagForm logId={state.log.id} ownerName={member.name} /> : null}
          {member.isMe && state.log.status === "pending" ? (
            <Link href="/submit" className={actionButtonVariants({ tone: "mint" })}>
              提出する
            </Link>
          ) : null}
        </>
      ) : null}
    </Sticker>
  );
}

function SubmissionLine({ log }: { log: TodayLog }) {
  if (!log.latest) return null;
  const text =
    log.latest.status === "judging"
      ? "提出しました。AI が判定中"
      : log.latest.status === "error"
        ? "提出しました。判定待ち"
        : log.latest.status === "rejected"
          ? `${log.attempts} 回目は不合格（${log.latest.score} 点）`
          : null;
  return text ? <p className="m-0 text-xs font-bold text-sub">{text}</p> : null;
}

function headline({ state }: TodayMember): string {
  switch (state.kind) {
    case "rest":
      return "今日は休息日";
    case "leave":
      return "休会中";
    case "undeclared":
      return "まだ宣言していない";
    case "no_declaration":
      return "宣言なし";
    case "declared":
      return state.log.revision_due_at && !state.log.revised_at ? "書き直し待ち" : `締切 ${formatJstTime(state.log.target_end_time!)}`;
  }
}

function Badge({ member }: { member: TodayMember }) {
  switch (member.state.kind) {
    case "no_declaration":
      return <Stamp tone="red" label="宣言なし" className="text-base" />;
    case "rest":
    case "leave":
      return <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.78rem] text-sub">おやすみ</span>;
    case "undeclared":
      return <Pill variant="outline">未宣言</Pill>;
    case "declared":
      if (member.state.log.status === "passed" || member.state.log.status === "completed") {
        return (
          <Stamp
            tone="mint"
            label={member.state.log.status === "completed" ? "PASSED" : "合格"}
            sub={member.state.log.passedScore === null ? undefined : `${member.state.log.passedScore}pt`}
            className="text-base"
          />
        );
      }
      return member.state.log.revision_due_at && !member.state.log.revised_at ? (
        <Stamp tone="red" label="指摘" className="text-base" />
      ) : (
        <Pill>宣言済み</Pill>
      );
  }
}
