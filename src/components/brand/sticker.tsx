import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// The core surface: a card stuck on paper — thick ink outline and a hard offset shadow.
// The viewer's rank restyles it through data-surface / data-shadow (rank-themes.css).
export const stickerVariants = cva("rounded-[14px] border-[3px] border-ink text-ink", {
  variants: {
    tone: {
      white: "bg-card",
      mint: "bg-mint",
      tape: "bg-tape",
      red: "bg-red text-white",
      note: "bg-[#fffdf6]",
      /** A warning: white with a red outline. */
      alert: "border-red bg-card",
    },
    shadow: {
      md: "shadow-hard",
      sm: "shadow-hard-sm",
      none: "",
    },
  },
  defaultVariants: { tone: "white", shadow: "md" },
});

export function Sticker({
  className,
  tone,
  shadow,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof stickerVariants>) {
  return (
    <div
      data-surface={tone ?? "white"}
      data-shadow={shadow ?? "md"}
      className={cn(stickerVariants({ tone, shadow }), className)}
      {...props}
    />
  );
}
