import { Sticker } from "@/components/brand/sticker";
import { formatJstDateTime } from "@/lib/time";

/** Shown during the trial week: penalties are displayed as "本番なら" but not charged. */
export function TrialNotice({ trialEndsAt }: { trialEndsAt: string }) {
  return (
    <Sticker tone="tape" shadow="sm" className="grid gap-0.5 px-3.5 py-2.5">
      <b className="text-sm">お試し期間中</b>
      <span className="text-xs font-medium">
        {formatJstDateTime(trialEndsAt)} まではペナルティが付きません（「本番なら 〇円」と表示だけします）。
      </span>
    </Sticker>
  );
}
