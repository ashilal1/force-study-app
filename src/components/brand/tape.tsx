import { cn } from "@/lib/utils";

/** A strip of yellow masking tape. Decorative; position it from the parent. */
export function Tape({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("tape-edge absolute block h-[22px] w-[74px] -rotate-6 border-2 border-ink bg-tape", className)}
    />
  );
}
