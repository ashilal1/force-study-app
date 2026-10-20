import { ThemePicker } from "@/components/settings/theme-picker";

// The 「見た目のテーマ」 screen (F16) with a sample pick, during Halloween. Tapping saves nothing
// here (no session); try the looks with the テーマ row of the bar instead.
export default function PreviewThemePage() {
  return (
    <div className="grid gap-4">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">見た目のテーマ</h1>
      <p className="m-0 text-sm font-medium text-sub">自分の画面だけが変わります。ほかのメンバーには見えません。</p>
      <ThemePicker theme="forest" seasonThemes activeSeason="halloween" />
    </div>
  );
}
