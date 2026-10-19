"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { createInvite, type InviteState } from "@/actions/invite";
import { ActionButton } from "@/components/brand/action-button";
import { Sticker } from "@/components/brand/sticker";
import { FieldError, SubmitButton } from "@/components/form/submit-button";

/**
 * "招待する": issues a single-use invite on the spot (ADR-026) and shows the code, the link and
 * the time left. The code is only ever shown here; closing the screen means issuing a new one.
 */
export function InvitePanel() {
  const [state, formAction] = useActionState<InviteState>(createInvite, { status: "idle" });

  return (
    <Sticker tone="note" className="grid gap-3 px-4 py-4">
      <div className="grid gap-0.5">
        <b>メンバーを招待する</b>
        <span className="text-xs font-medium text-sub">
          コードは 1 人だけ使えて、発行してから少しの時間で使えなくなります。送る直前に発行してください。
        </span>
      </div>

      {state.status === "issued" ? <IssuedInvite {...state} /> : null}
      {state.status === "error" ? <FieldError id="invite-error" message={state.message} /> : null}

      <form action={formAction}>
        <SubmitButton tone={state.status === "issued" ? "white" : "mint"} pendingLabel="発行中…">
          {state.status === "issued" ? "別の招待を発行する" : "招待コードを発行する"}
        </SubmitButton>
      </form>
    </Sticker>
  );
}

function IssuedInvite({ code, url, expiresAt }: { code: string; url: string; expiresAt: string }) {
  const secondsLeft = useSecondsUntil(expiresAt);
  const [copied, setCopied] = useState(false);
  const expired = secondsLeft === 0;
  const message = [
    `Commit or Treat に招待します。リンクを Safari か Chrome で開いて、Google でログインしてください（コード ${code}）`,
    url,
    `始める前に使い方を読んでください: ${new URL("/guide", url)}`,
  ].join("\n");

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ text: message });
        return;
      }
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      // The user closed the share sheet, or the clipboard is blocked; nothing to do.
    }
  }

  return (
    <div className="grid gap-3">
      <div className="th-box grid justify-items-center gap-1 rounded-[12px] border-[2.5px] border-dashed border-ink bg-card px-3 py-3">
        <span className={expired ? "font-en text-2xl tracking-wider text-sub line-through" : "font-en text-2xl tracking-wider"}>
          {code}
        </span>
        <span className="text-xs font-bold" aria-live="polite">
          {secondsLeft === null ? "--:--" : expired ? "期限切れ。もう一度発行してください" : `残り ${formatSeconds(secondsLeft)}`}
        </span>
      </div>
      {expired ? null : (
        <ActionButton type="button" tone="tape" onClick={share}>
          {copied ? "コピーしました" : "リンクを送る"}
        </ActionButton>
      )}
    </div>
  );
}

// Ticks every second; null on the server so hydration matches.
const subscribe = (onTick: () => void) => {
  const id = setInterval(onTick, 1_000);
  return () => clearInterval(id);
};
const getSecond = () => Math.floor(Date.now() / 1_000);
const getServerSecond = () => null;

function useSecondsUntil(until: string): number | null {
  const now = useSyncExternalStore(subscribe, getSecond, getServerSecond);
  if (now === null) return null;
  return Math.max(0, Math.floor(new Date(until).getTime() / 1_000) - now);
}

function formatSeconds(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
