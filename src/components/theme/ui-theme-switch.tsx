"use client";

import { useTransition } from "react";
import { setDevUiTheme } from "@/actions/dev-theme";
import { PICKABLE_THEMES, SEASON_THEMES } from "@/lib/theme/themes";

/**
 * Development only (the /preview bar): try each look theme, the seasonal ones whatever the date.
 * Sets the `dev_ui_theme` cookie; 「本来」 goes back to the member's own pick.
 */
export function UiThemeSwitch({ current }: { current: string | null }) {
  const [, startTransition] = useTransition();
  const pick = (theme: string | null) => startTransition(() => setDevUiTheme(theme));
  const options = [{ id: "paper", name: "標準" }, ...PICKABLE_THEMES, ...SEASON_THEMES];
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
