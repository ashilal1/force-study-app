import { cn } from "@/lib/utils";

const TONES = {
  mint: "text-mint-ink",
  red: "text-red",
  blue: "text-[#3d7fc4]",
  ink: "text-ink",
} as const;

export type StampTone = keyof typeof TONES;

/** A rubber stamp: colored frame, heavy type, slightly rotated and worn. */
export function Stamp({
  tone,
  label,
  sub,
  className,
}: {
  tone: StampTone;
  label: string;
  sub?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "stamp-ink inline-grid -rotate-[8deg] justify-items-center rounded-[10px] border-4 border-current bg-white/55 px-3 py-1 font-heading leading-[1.05] opacity-90",
        TONES[tone],
        className,
      )}
    >
      <span>{label}</span>
      {sub ? <span className="text-[0.9em]">{sub}</span> : null}
    </span>
  );
}
