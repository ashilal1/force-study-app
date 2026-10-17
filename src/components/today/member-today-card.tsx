import { Avatar } from "@/components/brand/avatar";
import { Pill } from "@/components/brand/pill";
import { Stamp } from "@/components/brand/stamp";
import { Sticker } from "@/components/brand/sticker";
import { FlagList } from "@/components/declare/flag-list";
import { PassphraseCard } from "@/components/declare/passphrase-card";
import Link from "next/link";
import { actionButtonVariants } from "@/components/brand/action-button";
import { formatJstDateTime, formatJstDay } from "@/lib/time";
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
            <Link href={`/members/${member.id}`} className="hover:underline">
              {member.name}
            </Link>
            {member.isMe ? <span className="ml-1.5 align-middle text-xs font-bold text-sub">（あなた）</span> : null}
          </p>
          <p className="m-0 truncate text-sm font-bold">{headline(member)}</p>
        </div>
        <Badge member={member} />
      </div>

      {member.previous ? <PreviousLine member={member} log={member.previous} /> : null}

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
          {state.log.dispute === "resending" || state.log.dispute === "final_review" ? (
            <p className="m-0 text-xs font-bold text-red">
              「怪しい」の指摘あり ・ {state.log.dispute === "resending" ? "証拠の送り直し受付中" : "最終審査中"}
            </p>
          ) : null}
          <FlagList flags={state.log.flags} />
          {member.canFlag ? <FlagForm logId={state.log.id} ownerName={member.name} /> : null}
          {state.log.status === "missed" ? (
            <Link
              href={`/reports/${state.log.id}`}
              className={
                member.isMe && state.log.report === "awaiting_report"
                  ? actionButtonVariants({ tone: "red" })
                  : "text-sm font-bold underline underline-offset-2"
              }
            >
              {member.isMe && state.log.report === "awaiting_report"
                ? "理由を申告する"
                : state.log.report === "under_review"
                  ? "理由を見る（審査中）→"
                  : "理由を見る →"}
            </Link>
          ) : null}
          {state.log.latest ? (
            <Link href={`/logs/${state.log.id}`} className="text-sm font-bold underline underline-offset-2">
              {state.log.status === "passed" && !member.isMe
                ? state.log.unverified
                  ? "AI 未判定。写真を確認する →"
                  : "証拠を見る（怪しければ指摘）→"
                : "証拠と判定を見る →"}
            </Link>
          ) : null}
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

/** Yesterday's day while it is still in play (ADR-032), in one line. */
function PreviousLine({ member, log }: { member: TodayMember; log: TodayLog }) {
  const day = formatJstDay(log.date);
  const disputed = log.dispute === "resending" || log.dispute === "final_review";
  const [text, href, link] =
    log.status === "pending"
      ? [`${day} の分は提出待ち（${formatJstDateTime(log.target_end_time!)} まで）`, member.isMe ? "/submit" : `/logs/${log.id}`, member.isMe ? "提出する →" : null]
      : log.status === "missed"
        ? [
            log.report === "awaiting_report" ? `${day} の分は未達成・理由の申告待ち` : `${day} の分は未達成・理由を審査中`,
            `/reports/${log.id}`,
            member.isMe && log.report === "awaiting_report" ? "理由を申告する →" : "理由を見る →",
          ]
        : disputed
          ? [`${day} の分に「怪しい」の指摘あり`, `/logs/${log.id}`, "証拠を見る →"]
          : [
              `${day} の分は合格（「怪しい」は ${formatJstDateTime(log.dispute_window_ends_at!)} まで）`,
              `/logs/${log.id}`,
              member.isMe ? null : "証拠を見る（怪しければ指摘）→",
            ];
  return (
    <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-2 rounded-[8px] border-[1.5px] border-dashed border-ink px-2.5 py-1.5 text-xs font-bold">
      <span>{text}</span>
      {link ? (
        <Link href={href} className="underline underline-offset-2">
          {link}
        </Link>
      ) : null}
    </p>
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
      return state.log.revision_due_at && !state.log.revised_at ? "書き直し待ち" : `締切 ${formatJstDateTime(state.log.target_end_time!)}`;
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
      if (member.state.log.status === "missed") {
        const sub =
          member.state.log.report === "awaiting_report" ? "申告待ち" : member.state.log.report === "under_review" ? "審査中" : undefined;
        return <Stamp tone="red" label="未達成" sub={sub} className="text-base" />;
      }
      if (member.state.log.status === "invalidated") {
        return <Stamp tone="red" label="不認定" className="text-base" />;
      }
      if (member.state.log.dispute === "resending" || member.state.log.dispute === "final_review") {
        return <Stamp tone="blue" label="審査中" sub="怪しい" className="text-base" />;
      }
      if (member.state.log.status === "passed" && member.state.log.unverified) {
        return <Stamp tone="mint" label="仮合格" sub="AI未判定" className="text-base" />;
      }
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
