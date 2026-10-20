import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { ThemeLayer } from "@/components/standing/theme-layer";
import { ThemeSwitch } from "@/components/standing/theme-switch";
import { devLookOverride, devRankOverride } from "@/components/standing/viewer-theme";
import { UiThemeLayer } from "@/components/theme/ui-theme-layer";
import { UiThemeSwitch } from "@/components/theme/ui-theme-switch";

// Development-only gallery of screens with sample data. Excluded from the auth proxy.
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <>
      <div className="bg-[#141416] px-4 py-2 text-xs text-white">
        <div className="mx-auto flex max-w-[440px] flex-wrap gap-x-3 md:max-w-[720px] gap-y-1">
          <span className="font-black">PREVIEW（サンプルデータ）</span>
          <Link href="/preview">ホーム</Link>
          <Link href="/preview/submit">提出</Link>
          <Link href="/preview/result">判定結果</Link>
          <Link href="/preview/report">理由申告</Link>
          <Link href="/preview/intro">はじめに</Link>
          <Link href="/preview/tips">コーチマーク</Link>
          <Link href="/preview/xp">XP の推移</Link>
          <Link href="/preview/theme">テーマ</Link>
          <Suspense fallback={null}>
            <PreviewTheme />
          </Suspense>
        </div>
      </div>
      <AppShell basePath="/preview">{children}</AppShell>
    </>
  );
}

/**
 * The rank look (F14) and the look theme (F16) picked in the bar. They also apply to the real
 * screens in development; a look theme wins over the rank look, as it does for members.
 */
async function PreviewTheme() {
  const rank = await devRankOverride();
  const look = await devLookOverride();
  return (
    <>
      <ThemeSwitch current={rank} />
      <UiThemeSwitch current={look ? (look.kind === "theme" ? look.id : "paper") : null} />
      {look?.kind === "theme" ? <UiThemeLayer theme={look.id} /> : rank ? <ThemeLayer rank={rank} /> : null}
    </>
  );
}
