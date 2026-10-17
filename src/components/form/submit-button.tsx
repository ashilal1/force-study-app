"use client";

import { useFormStatus } from "react-dom";
import { ActionButton } from "@/components/brand/action-button";

/** ActionButton that disables itself and swaps its label while the surrounding form submits. */
export function SubmitButton({
  pendingLabel,
  children,
  ...props
}: React.ComponentProps<typeof ActionButton> & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <ActionButton type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </ActionButton>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="m-0 text-sm font-bold text-red">
      {message}
    </p>
  );
}
