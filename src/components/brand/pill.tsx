import { cn } from "@/lib/utils";

export function Pill({
  className,
  variant = "ink",
  ...props
}: React.ComponentProps<"span"> & { variant?: "ink" | "outline" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full text-[0.78rem] font-bold tracking-wide whitespace-nowrap",
        variant === "ink" ? "bg-ink px-3.5 py-1 text-white" : "border-[2.5px] border-ink bg-card px-2.5 py-0.5 text-ink",
        className,
      )}
      {...props}
    />
  );
}
