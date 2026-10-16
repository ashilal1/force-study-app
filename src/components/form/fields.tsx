import { cn } from "@/lib/utils";

const fieldBox =
  "w-full rounded-[14px] border-[3px] border-ink bg-card px-3 py-2.5 text-base font-bold text-ink shadow-hard-sm placeholder:font-medium placeholder:text-sub focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink";

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="font-sans text-base font-black">
      {children}
    </label>
  );
}

export function TextArea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBox, "min-h-20 resize-y leading-relaxed font-medium", className)} {...props} />;
}

export function TextInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldBox, className)} {...props} />;
}

/** "52 / 30 字以上" — turns red until the minimum is met. */
export function CharCount({ value, min }: { value: string; min: number }) {
  const length = [...value.trim()].length;
  return (
    <p className={cn("m-0 -mt-1 text-right text-xs", length >= min ? "text-sub" : "text-red")}>
      {length} / {min} 字以上
    </p>
  );
}
