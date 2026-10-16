@AGENTS.md

# Commit or Treat (仮)

友人グループ（3〜6名）向けの強制学習アプリ。毎日「宣言 → 成果物の提出 → Gemini による判定」を回し、失敗するとペナルティが付き、3pt ごとに全員へ PayPay で定額を払う。**0 円運用**、**通知はアプリ内で完結**（外部チャットツールは使わない）。

## 最初に読むもの
- `docs/requirements.md` — 何を作るか（業務ルールの正本）
- `docs/architecture.md` — 構成・フロー・ディレクトリ構成
- `docs/database.md` — テーブル・RPC・RLS
- `docs/decisions.md` — なぜそうしたか (ADR)
- `docs/roadmap.md` — 今どこまでできているか

## 技術スタック
Next.js 16 (App Router, `src/`, Turbopack) / React 19 / TypeScript / Tailwind v4 / shadcn/ui ・ Supabase (Postgres, Auth, Storage, Realtime, pg_cron) ・ Gemini API（`@google/genai`、モデルは `GEMINI_MODEL`） ・ Web Push（`web-push` + `public/sw.js`） ・ Vercel Hobby

## コマンド
```bash
npm run dev            # 開発サーバー
npm run lint           # ESLint
npm run build          # 本番ビルド（型チェックを含む）
npx supabase start     # ローカルの Supabase（Docker が必要）
npx supabase db reset  # マイグレーションを適用し直す
npx supabase gen types typescript --local > src/types/database.ts
```

## 守るべきルール
- **書き込みはサーバーだけ。** クライアントは RLS 越しに読むだけにする。状態を変える処理は Server Action / Route Handler → service role → Postgres RPC の順で通す（ADR-004）。`authenticated` への GRANT を増やすときは必ず `docs/database.md` の §4 を更新する。
- **業務ルールの検証は RPC に書く。** 締切・試行回数・休息日の上限などを TypeScript 側にだけ書かない（UI での事前チェックは補助として可）。
- **時刻は JST、基準はサーバー。** 学習日は `(now() at time zone 'Asia/Tokyo')::date`。SQL で `current_date` を使わない。クライアントの時計を判定に使わない。日付の処理は `src/lib/time.ts` にまとめる。
- **ポイントは `penalties` 台帳から集計する。** カウンター列を作らない（ADR-005）。
- **通知は `activity_events` に書いて `lib/notify` に渡す。** Server Action から直接 Push を送らない。
- **無料枠を超える構成にしない。** 有料のサービス・プランや GitHub Actions の定期実行を入れない（ADR-003）。
- **秘密情報**: `SUPABASE_SERVICE_ROLE_KEY` / `GEMINI_API_KEY` / `VAPID_PRIVATE_KEY` / `CRON_SECRET` / `INVITE_CODE` は `server-only` のモジュールからだけ参照する。`NEXT_PUBLIC_` を付けない。
- Next.js 16 では `middleware.ts` が **`proxy.ts`** に変わっている。API を使う前に `node_modules/next/dist/docs/` を確認する。
- UI の文言は日本語。コード中の識別子は英語。

## 設計を変えるとき
仕様や構成を変えたら、同じコミットで `docs/` を更新する。判断を伴う変更は `docs/decisions.md` に ADR を追記する。マイグレーションは追加だけにする（適用済みのファイルは書き換えない）。
