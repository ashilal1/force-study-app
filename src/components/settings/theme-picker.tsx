"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setUiTheme } from "@/actions/theme";
import { FieldError } from "@/components/form/submit-button";
import { PICKABLE_THEMES, SEASON_THEMES, seasonLabel, type PickableThemeId } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";

type Choice = { theme: PickableThemeId | null; seasonThemes: boolean };

/**
 * 「見た目のテーマ」 (F16): a card per theme with a swatch drawn in that theme's own tokens
 * ([data-ui-preview], ui-themes.css), and the switch for the seasonal ones. Each tap saves at once;
 * the screen follows when the save comes back.
 */
export function ThemePicker({ theme, seasonThemes, activeSeason }: Choice & { activeSeason: string | null }) {
  const [saved, setSaved] = useState<Choice>({ theme, seasonThemes });
  const [shown, show] = useOptimistic(saved);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  const save = (next: Choice) =>
    startTransition(async () => {
      show(next);
      setError(undefined);
      const result = await setUiTheme(next.theme, next.seasonThemes);
      if (result.error) setError(result.error);
      else setSaved(next);
    });

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-[14px] border-[3px] border-ink bg-card px-3.5 py-3 shadow-hard-sm" data-surface="white" data-shadow="sm">
        <b id="season-label" className="text-sm">
          期間限定テーマに自動で切り替える
        </b>
        <button
          type="button"
          role="switch"
          aria-checked={shown.seasonThemes}
          aria-labelledby="season-label"
          onClick={() => save({ ...shown, seasonThemes: !shown.seasonThemes })}
          className={cn("relative h-[30px] w-[52px] rounded-full border-[3px] border-ink", shown.seasonThemes ? "bg-mint" : "bg-muted")}
        >
          <span
            className={cn(
              "absolute top-[2px] size-5 rounded-full border-2 border-[#141416] bg-white transition-[left] duration-150",
              shown.seasonThemes ? "left-[24px]" : "left-[2px]",
            )}
          />
        </button>
        <span className="col-span-2 text-xs font-medium text-sub">
          {SEASON_THEMES.map((season) => `${season.name} ${seasonLabel(season)}`).join("・")}
          。期間が終わると、選んでいたテーマに戻ります。
        </span>
      </div>

      <FieldError id="theme-error" message={error} />

      <div className="grid grid-cols-2 gap-3.5">
        <ThemeCard
          id="paper"
          name="標準"
          en="PAPER"
          description="紙とインクとステッカー。ランクで金・銀・銅に変わります"
          active={shown.theme === null}
          onPick={() => save({ ...shown, theme: null })}
        />
        {PICKABLE_THEMES.map((option) => (
          <ThemeCard
            key={option.id}
            id={option.id}
            name={option.name}
            en={option.en}
            description={option.description}
            active={shown.theme === option.id}
            onPick={() => save({ ...shown, theme: option.id })}
          />
        ))}
      </div>

      <section className="grid gap-2">
        <h2 className="m-0 font-heading text-[1.1rem] leading-tight font-normal">期間限定</h2>
        <div className="grid grid-cols-2 gap-3.5">
          {SEASON_THEMES.map((season) => (
            <ThemeCard
              key={season.id}
              id={season.id}
              name={season.name}
              en={season.en}
              description={season.description}
              status={activeSeason === season.id ? `期間中・${seasonLabel(season).split("〜")[1]} まで` : `${seasonLabel(season)}`}
              active={activeSeason === season.id && shown.seasonThemes}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/** Paper (標準) has no tokens of its own: its swatch is drawn in the paper look's colors. */
const PAPER = {
  bg: "#f4efe8",
  card: "#ffffff",
  line: "#141416",
  pri: "#a9dcc6",
  shs: "3px 3px 0 #141416",
  title: "#141416",
  titleShadow: "2px 2px 0 #fff, 3px 3px 0 #141416",
};

function ThemeCard({
  id,
  name,
  en,
  description,
  active,
  status,
  onPick,
}: {
  id: string;
  name: string;
  en: string;
  description: string;
  active: boolean;
  status?: string;
  onPick?: () => void;
}) {
  const paper = id === "paper";
  const v = (token: string, fallback: string) => (paper ? fallback : `var(--ui-${token})`);
  const label = status ?? (active ? "使用中" : "いつでも使える");
  const Card = onPick ? "button" : "div";
  return (
    <Card
      {...(onPick ? { type: "button" as const, onClick: onPick, "aria-pressed": active } : {})}
      data-surface="white"
      data-shadow="sm"
      className={cn(
        "grid overflow-hidden rounded-[14px] border-[3px] border-ink bg-card p-0 text-left text-ink shadow-hard-sm",
        active && "outline-[3px] outline-offset-[3px] outline-[var(--ui-dot,#3f9b7b)]",
      )}
    >
      <span
        data-ui-preview={paper ? undefined : id}
        aria-hidden
        className="relative block h-24 overflow-hidden border-b-[3px] border-ink"
        style={{ background: v("bg", PAPER.bg) }}
      >
        <span
          className="absolute top-3.5 right-7 left-3 h-9"
          style={{
            background: v("card", PAPER.card),
            border: `${v("bw", "3px")} solid ${v("line", PAPER.line)}`,
            borderRadius: v("r", "14px"),
            boxShadow: v("shs", PAPER.shs),
          }}
        />
        <span
          className="absolute bottom-3 left-3 h-5 w-16"
          style={{
            background: v("pri", PAPER.pri),
            border: `${v("bw", "3px")} solid ${v("line", PAPER.line)}`,
            borderRadius: v("rb", "12px"),
            boxShadow: v("btn-sh", PAPER.shs),
          }}
        />
        <span
          className={cn("absolute right-2.5 bottom-2 font-en", en.length > 7 ? "text-[12px]" : "text-[15px]")}
          style={{ color: v("title-ink", PAPER.title), textShadow: v("title-sh", PAPER.titleShadow) }}
        >
          {en}
        </span>
      </span>
      <span className="grid gap-1 px-2.5 pt-2 pb-2.5">
        <b className="font-heading text-base leading-tight font-normal">{name}</b>
        <span className="min-h-8 text-[0.72rem] leading-snug font-medium text-sub">{description}</span>
        <span
          className={cn(
            "justify-self-start rounded-full border-2 px-2 py-px text-[0.7rem] font-black",
            active ? "border-transparent bg-ink text-white" : "border-current",
          )}
        >
          {label}
        </span>
      </span>
    </Card>
  );
}
