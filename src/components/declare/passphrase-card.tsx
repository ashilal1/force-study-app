import { Sticker } from "@/components/brand/sticker";
import { Tape } from "@/components/brand/tape";
import { TermHelp } from "@/components/onboarding/term-help";
import { cn } from "@/lib/utils";

/** Today's passphrase (F4a): handwritten into at least one submission photo. Visible to everyone. */
export function PassphraseCard({ value, compact = false }: { value: string; compact?: boolean }) {
  return (
    <Sticker
      tone="note"
      shadow="none"
      data-surface="pass"
      className={cn(
        "relative flex items-end justify-between border-[2.5px] border-dashed",
        compact ? "px-2.5 pt-2.5 pb-1.5" : "px-3 pt-3.5 pb-2.5",
      )}
    >
      {compact ? null : <Tape className="-top-3 left-3.5" />}
      <div>
        <small className="flex items-center gap-1.5 text-xs text-sub">
          今日の合言葉{compact ? "" : "（提出写真に手書きで写す）"}
          {compact ? null : <TermHelp term="passphrase" />}
        </small>
        <strong className={cn("font-hand leading-tight font-semibold", compact ? "text-xl" : "text-[1.7rem]")}>{value}</strong>
      </div>
      {compact ? null : <span className="text-xs">全員に公開</span>}
    </Sticker>
  );
}
