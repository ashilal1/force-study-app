"use client";

import { useTransition } from "react";
import { setDevUiTheme } from "@/actions/dev-theme";
import { SEASON_THEMES } from "@/lib/theme/themes";

/**
 * Development only (the /preview bar): try each seasonal theme whatever the date, or 標準 (the rank
 * look). Sets the `dev_ui_theme` cookie; 「本来」 goes back to what the date and rank give.
 */
export function UiThemeSwitch({ current }: { current: string | null }) {
  const [, startTransition] = useTransition();
  const pick = (theme: string | null) => startTransition(() => setDevUiTheme(theme));
  const options = [{ id: "paper", name: "標準" }, ...SEASON_THEMES];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span className="text-white/60">テーマ:</span>
      {options.map((theme) => (
        <button key={theme.id} type="button" onClick={() => pick(theme.id)} className={current === theme.id ? "font-black underline" : ""}>
          {theme.name}
        </button>
      ))}
      <button type="button" onClick={() => pick(null)} className={current === null ? "font-black underline" : ""}>
        本来
      </button>
    </span>
  );
}
