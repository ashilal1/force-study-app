import type { Platform } from "@/lib/push-client";
import { cn } from "@/lib/utils";

// How to get banner + sound on each OS (F0 step 4), and how to undo a blocked permission.
// Web apps can't detect or change OS-level banner/sound settings, so the member follows these.
// Checked against Apple / Google / Microsoft help pages in 2026-10 (iOS 26, Android 16,
// Windows 11, macOS 26). Labels differ slightly between OS versions and Android makers.

type Guide = {
  label: string;
  /** Turn on banners and sound. */
  steps: string[];
  /** It still doesn't make a sound or show a banner. */
  troubleshoot: string[];
  /** The permission prompt was declined. */
  unblock: string[];
};

const GUIDES: Record<Exclude<Platform, "other">, Guide> = {
  ios: {
    label: "iPhone",
    steps: [
      "「設定」アプリ →「通知」→ 一覧から「Commit or Treat」を開く",
      "「通知を許可」をオン",
      "「ロック画面」「通知センター」「バナー」の 3 つにチェック",
      "「バナースタイル」は「持続的」がおすすめ（タップするまで消えない）",
      "「サウンド」をオン",
    ],
    troubleshoot: [
      "消音モード（本体横のスイッチやアクションボタン）がオンだと鳴りません",
      "集中モード（おやすみモードなど）がオンなら、オフにするか「許可された通知」に Commit or Treat を追加",
      "「設定」→「サウンドと触覚」で音量を上げる",
      "通知が届かないときは、ホーム画面のアイコンから開いているか確かめる（Safari のタブでは届きません）",
    ],
    unblock: [
      "「設定」→「通知」→「Commit or Treat」→「通知を許可」をオン",
      "一覧に無いときは、ホーム画面のアイコンを削除して、Safari の共有ボタン →「ホーム画面に追加」（「Web アプリとして開く」はオンのまま）からやり直す",
    ],
  },
  android: {
    label: "Android",
    steps: [
      "「設定」→「アプリ」→「Chrome」（ホーム画面にアプリとして追加した場合は「Commit or Treat」）→「通知」",
      "「通知を許可」（「すべての Chrome の通知」）をオン",
      "カテゴリの「サイト」（または「Commit or Treat」）を開く",
      "「デフォルト」（音やバイブで知らせる）を選び、「サイレント」にしない",
      "「画面にポップアップ表示」をオン",
      "名前は機種で少し違います（例: Galaxy は「音とポップアップで通知」）",
    ],
    troubleshoot: [
      "マナーモード・サイレントモード（おやすみ時間）をオフにする",
      "「設定」→「音とバイブレーション」で通知の音量を上げる",
      "通知が遅れて届くときは「設定」→「アプリ」→「Chrome」→「バッテリー」を「制限なし」にする",
    ],
    unblock: [
      "Chrome でこのページを開き、アドレスバーの左のアイコン →「権限」→「通知」→「許可」",
      "または Chrome の「︙」→「設定」→「サイトの設定」→「通知」で、このサイトを許可",
    ],
  },
  windows: {
    label: "Windows",
    steps: [
      "「スタート」→「設定」→「システム」→「通知」",
      "一番上の「通知」をオン",
      "アプリの一覧で「Google Chrome」（Edge なら「Microsoft Edge」、アプリとしてインストールした場合は「Commit or Treat」）を開く",
      "「通知バナーを表示」と「通知が届いたら音を鳴らす」をオン",
    ],
    troubleshoot: [
      "「応答不可」がオンだと何も出ません。「設定」→「システム」→「通知」で「応答不可」をオフにする",
      "集中セッション中も通知が止まります",
      "タスクバーの音量がミュートになっていないか確かめる",
    ],
    unblock: [
      "アドレスバーの左のアイコン（サイト情報）→「通知」を「許可」にして、ページを再読み込み",
    ],
  },
  mac: {
    label: "Mac",
    steps: [
      "アップルメニュー →「システム設定」→「通知」",
      "アプリの一覧で「Google Chrome」（Safari なら「Safari」、Chrome でアプリとしてインストールした場合は「Commit or Treat」）を開く",
      "「通知を許可」をオン",
      "通知のスタイルを「持続的」（または「バナー」）にする",
      "「通知音を鳴らす」（macOS のバージョンによっては「通知のサウンドを再生」）をオン",
    ],
    troubleshoot: [
      "Chrome は自分では音を鳴らしません。上の「通知音を鳴らす」がオフだと、どのサイトの通知も無音になります",
      "集中モード（おやすみモードなど）がオンなら、コントロールセンターからオフにする",
      "サウンドの出力先と音量（「システム設定」→「サウンド」→「通知音の音量」）を確かめる",
    ],
    unblock: [
      "Chrome: アドレスバーの左のアイコン →「通知」を「許可」にして、ページを再読み込み",
      "Safari: 「Safari」→「設定」→「Web サイト」→「通知」で、このサイトを「許可」",
    ],
  },
};

const ORDER: Exclude<Platform, "other">[] = ["ios", "android", "windows", "mac"];

/** One collapsible section per OS; the member's own OS starts open. */
export function SettingsGuide({ platform, focus }: { platform: Platform; focus: "sound" | "unblock" }) {
  return (
    <div className="grid gap-2">
      {ORDER.map((os) => {
        const guide = GUIDES[os];
        return (
          <details
            key={os}
            open={os === platform}
            className="group rounded-[12px] border-[2.5px] border-ink bg-card open:shadow-hard-sm"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 font-bold [&::-webkit-details-marker]:hidden">
              <span>
                {guide.label}
                {os === platform ? <span className="ml-2 text-xs text-sub">（この端末）</span> : null}
              </span>
              <span aria-hidden className="transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="grid gap-3 border-t-2 border-dashed border-ink px-3.5 pt-2.5 pb-3.5 text-sm leading-relaxed font-medium">
              {focus === "unblock" ? (
                <Steps title="通知のブロックを解除する" items={guide.unblock} ordered />
              ) : (
                <>
                  <Steps title="バナーと音を ON にする" items={guide.steps} ordered />
                  <Steps title="それでも鳴らない・出ないとき" items={guide.troubleshoot} />
                </>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function Steps({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return (
    <div className="grid gap-1">
      <b className="text-sm">{title}</b>
      <List className={cn("m-0 grid gap-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </List>
    </div>
  );
}
