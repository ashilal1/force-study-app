import { Avatar } from "@/components/brand/avatar";
import { Stamp } from "@/components/brand/stamp";
import { Sticker } from "@/components/brand/sticker";
import { formatJstTime } from "@/lib/time";
import type { MemberStatus, MemberToday } from "./types";

function goalLine(status: MemberStatus): string {
  switch (status.kind) {
    case "undeclared":
      return "まだ宣言していない";
    case "rest":
      return "今日は休息日";
    case "leave":
      return "休会中";
    case "penalized":
      return status.goal ? `目標：${status.goal}` : "宣言なし";
    default:
      return `目標：${status.goal}`;
  }
}

function Badge({ status }: { status: MemberStatus }) {
  switch (status.kind) {
    case "completed":
      return <Stamp tone="mint" label="PASSED" sub={`${status.score}点`} />;
    case "passed":
      return <Stamp tone="mint" label="合格" sub={`確定まで ${formatJstTime(status.disputeWindowEndsAt)}`} className="text-base" />;
    case "penalized":
      return <Stamp tone="red" label={status.label} sub={`${status.points.toLocaleString()}円`} />;
    case "disputed":
      return <Stamp tone="blue" label="審査中" sub={`怪しい ${status.flagCount}`} />;
    case "under_review":
      return <Stamp tone="blue" label="審査中" sub="理由" />;
    case "awaiting_report":
      return <Stamp tone="red" label="未達成" sub="申告待ち" className="text-base" />;
    case "undeclared":
      return (
        <span className="rotate-3 border-[2.5px] border-ink bg-tape px-2.5 py-1.5 text-[0.8rem] leading-snug shadow-hard-sm">
          宣言締切 {formatJstTime(status.declarationCutoff)}
        </span>
      );
    case "pending":
      return (
        <span className="rounded-full border-[2.5px] border-ink bg-card px-2.5 py-0.5 text-[0.78rem]">
          締切 {formatJstTime(status.deadline)}
        </span>
      );
    case "rest":
    case "leave":
      return <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.78rem] text-sub">おやすみ</span>;
  }
}

export function MemberCard({ member }: { member: MemberToday }) {
  return (
    <Sticker className="relative grid min-h-[88px] grid-cols-[auto_1fr_auto] items-center gap-x-3 px-3.5 py-3">
      <Avatar name={member.name} src={member.avatarUrl} colorIndex={member.colorIndex} />
      <div className="min-w-0">
        <p className="m-0 font-heading text-[1.3rem] leading-tight">{member.name}</p>
        <p className="m-0 truncate text-sm font-bold">{goalLine(member.status)}</p>
      </div>
      <div className="justify-self-end">
        <Badge status={member.status} />
      </div>
    </Sticker>
  );
}
