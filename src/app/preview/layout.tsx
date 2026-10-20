import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { ThemeLayer } from "@/components/standing/theme-layer";
import { ThemeSwitch } from "@/components/standing/theme-switch";
import { devRankOverride } from "@/components/standing/viewer-theme";

// Development-only gallery of screens with sample data. Excluded from the auth proxy.
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <>
      <div className="bg-ink px-4 py-2 text-xs text-white">
        <div className="mx-auto flex max-w-[440px] flex-wrap gap-x-3 md:max-w-[720px] gap-y-1">
          <span className="font-black">PREVIEW（サンプルデータ）</span>
          <Link href="/preview">ホーム</Link>
          <Link href="/preview/submit">提出</Link>
          <Link href="/preview/result">判定結果</Link>
          <Link href="/preview/report">理由申告</Link>
          <Link href="/preview/intro">はじめに</Link>
          <Link href="/preview/tips">コーチマーク</Link>
          <Link href="/preview/xp">XP の推移</Link>
          <Suspense fallback={null}>
            <PreviewTheme />
          </Suspense>
        </div>
      </div>
      <AppShell basePath="/preview">{children}</AppShell>
    </>
  );
}

/** The rank look picked in the bar (F14). It also applies to the real screens in development. */
async function PreviewTheme() {
  const rank = await devRankOverride();
  return (
    <>
      <ThemeSwitch current={rank} />
      {rank ? <ThemeLayer rank={rank} /> : null}
    </>
  );
}
