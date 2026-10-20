import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "@/components/app/page-loading";
import { Sticker } from "@/components/brand/sticker";
import { ThemePicker } from "@/components/settings/theme-picker";
import { requireMember } from "@/lib/auth";
import { getStandings } from "@/lib/standing/load";
import { isPickableTheme, seasonLabel, seasonOf } from "@/lib/theme/themes";
import { jstDateString } from "@/lib/time";

export const metadata: Metadata = { title: "見た目のテーマ | Commit or Treat" };

// 「見た目のテーマ」 (F16): pick how your own screens look. Nobody else sees it.
export default function ThemeSettingsPage() {
  return (
    <div className="grid gap-4">
      <Link href="/settings" className="justify-self-start text-sm font-bold underline underline-offset-2">
        ← 設定
      </Link>
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">見た目のテーマ</h1>
      <p className="m-0 text-sm font-medium text-sub">自分の画面だけが変わります。ほかのメンバーには見えません。</p>
      <Suspense fallback={<PageLoading />}>
        <Picker />
      </Suspense>
    </div>
  );
}

async function Picker() {
  const me = await requireMember();
  const rank = (await getStandings()).get(me.id)?.rank.id;
  const season = seasonOf(jstDateString());
  return (
    <>
      {rank === "doushiyou-mo-nai" ? (
        <Sticker tone="alert" shadow="sm" className="px-3.5 py-3 text-sm font-bold">
          「どうしようもない」のあいだは、どのテーマを選んでもコンクリートの見た目のままです。ランクが上がると、選んだテーマになります。
        </Sticker>
      ) : season && me.season_themes ? (
        <Sticker tone="note" shadow="sm" className="px-3.5 py-3 text-sm font-bold">
          今は{season.name}の期間です（{seasonLabel(season)}）。期間が終わると、ここで選んだテーマに戻ります。
        </Sticker>
      ) : null}
      <ThemePicker
        theme={isPickableTheme(me.ui_theme) ? me.ui_theme : null}
        seasonThemes={me.season_themes}
        activeSeason={season?.id ?? null}
      />
    </>
  );
}
