import { cn } from "@/lib/utils";

/** Paper receipt with a torn zigzag top. Children are the lines; use <ReceiptRule /> between sections. */
export function Receipt({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "receipt-edge mt-3.5 grid gap-2.5 border-[3px] border-ink bg-card px-4.5 pt-6 pb-4 font-receipt text-ink shadow-hard",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ReceiptRule() {
  return <hr className="m-0 border-0 border-t-[3px] border-dashed border-ink" />;
}

export function Barcode({ className }: { className?: string }) {
  return <div aria-hidden className={cn("barcode mx-2.5 mt-1 h-7", className)} />;
}
