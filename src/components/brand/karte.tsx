import { cn } from "@/lib/utils";

/** Mint clipboard card used for AI review results. */
export function Karte({
  title,
  tone = "mint",
  className,
  children,
}: {
  title: string;
  /** Red for a failed review. */
  tone?: "mint" | "red";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-karte={tone}
      className={cn(
        "th-karte relative mt-3 grid gap-2 rounded-2xl border-[3px] border-ink px-4 pt-8 pb-4 text-ink shadow-hard",
        tone === "red" ? "bg-[#f6c9c5]" : "bg-mint",
        className,
      )}
    >
      <span aria-hidden className="absolute -top-4 left-1/2 h-[26px] w-24 -translate-x-1/2 rounded-lg border-[3px] border-ink bg-[#8fcdb2]">
        <span className="absolute -top-3 left-1/2 size-[18px] -translate-x-1/2 rounded-full border-[3px] border-ink bg-mint" />
      </span>
      <h3 className="m-0 text-center font-heading text-xl font-normal">{title}</h3>
      {children}
    </section>
  );
}
