import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Chunky sticker button. Pressing removes the shadow and sinks it by the same amount.
// th-btn / th-btn-<tone> let the viewer's rank restyle it (rank-themes.css).
export const actionButtonVariants = cva(
  [
    "th-btn grid w-full place-items-center gap-0.5 rounded-xl border-[3px] border-ink px-4 py-3 text-center text-ink",
    "font-heading text-lg leading-tight shadow-[5px_5px_0_var(--ink)] transition-[transform,box-shadow] duration-75",
    "active:translate-x-[5px] active:translate-y-[5px] active:shadow-none",
    "focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-ink",
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      tone: {
        mint: "th-btn-mint bg-mint",
        white: "th-btn-white bg-card",
        orange: "th-btn-orange bg-orange text-white",
        red: "th-btn-red bg-red text-white",
        tape: "th-btn-tape bg-tape",
      },
    },
    defaultVariants: { tone: "mint" },
  },
);

export function ActionButton({
  className,
  tone,
  hint,
  children,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof actionButtonVariants> & { hint?: string }) {
  return (
    <button className={cn(actionButtonVariants({ tone }), className)} {...props}>
      <span>{children}</span>
      {hint ? <span className="font-sans text-xs font-bold">{hint}</span> : null}
    </button>
  );
}
