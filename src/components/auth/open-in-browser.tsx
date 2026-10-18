"use client";

import { useState } from "react";
import { ActionButton } from "@/components/brand/action-button";
import { chromeIntentUrl } from "@/lib/in-app-browser";

/**
 * Shown on /login instead of the Google button inside LINE, Instagram, … (F15): Google refuses to
 * sign in there. The URL is read when a button is pressed, so it keeps ?next= (an invite link's code).
 */
export function OpenInBrowser({ app, android }: { app: string | null; android: boolean }) {
  const [shownUrl, setShownUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Some in-app browsers block the clipboard; show the URL to copy by hand.
      setShownUrl(url);
    }
  }

  return (
    <div className="grid gap-4">
      <div role="alert" className="grid gap-1.5 rounded-[10px] border-[2.5px] border-red bg-white px-3 py-2.5">
        <b className="text-sm text-red">このままではログインできません</b>
        <p className="m-0 text-sm leading-relaxed font-medium">
          {app ? `${app} の中のブラウザ` : "アプリの中のブラウザ"}では、Google のログインが使えません。{android ? "Chrome" : "Safari"}{" "}
          で開き直してください。
        </p>
      </div>

      {android ? (
        <ActionButton type="button" tone="mint" onClick={() => window.location.assign(chromeIntentUrl(window.location.href))}>
          Chrome で開く
        </ActionButton>
      ) : null}

      <ol className="m-0 grid gap-1 pl-5 text-sm leading-relaxed font-medium">
        <li>画面の上か下にある「︙」「…」や共有のボタンを押す</li>
        <li>「ブラウザで開く」「{android ? "Chrome" : "Safari"} で開く」などを選ぶ</li>
        <li>見つからなければ、下のボタンで URL をコピーして {android ? "Chrome" : "Safari"} に貼り付ける</li>
      </ol>

      <ActionButton type="button" tone={android ? "white" : "mint"} onClick={copy}>
        {copied ? "コピーしました" : "URL をコピーする"}
      </ActionButton>
      {shownUrl ? (
        <input
          readOnly
          value={shownUrl}
          aria-label="このページの URL"
          onFocus={(event) => event.currentTarget.select()}
          className="w-full rounded-[10px] border-[2.5px] border-ink bg-card px-3 py-2 text-sm"
        />
      ) : null}
    </div>
  );
}
