# 実装ロードマップ

各マイルストーンは「動く状態でマージできる」単位にする。チェックが付いたら次へ進む。

## M0. 環境構築 ✅
- [x] Next.js 16 (App Router, TS, Tailwind v4) の雛形
- [x] git / CLAUDE.md / .claude / docs / README / .env.example

## M1. 基盤
- [ ] 依存関係を追加: `@supabase/ssr` `@supabase/supabase-js` `zod` `@google/genai` `web-push` `browser-image-compression`、shadcn/ui の初期化
- [ ] Supabase CLI でローカル開発環境（`supabase init` / `supabase start`）
- [ ] `src/lib/env.ts`（環境変数を zod で検証）、`src/lib/time.ts`（JST）
- [ ] `src/lib/supabase/{client,server,admin,proxy}.ts`、`src/proxy.ts`
- [ ] マイグレーション: 全テーブル・制約・RLS・列単位 GRANT・Storage バケットとポリシー
- [ ] `supabase gen types` → `src/types/database.ts`

## M2. 認証・プロフィール
- [ ] ログイン / 招待コードつきサインアップ（ADR-006）
- [ ] profile の自動作成トリガー、最初のユーザーを admin にする
- [ ] プロフィール編集（表示名・アバター・PayPay リンク）

## M3. 通知基盤（後の機能はすべてこれを使うので先に作る）
- [ ] `activity_events` → `notifications` の配信 (`lib/notify`)
- [ ] ベル・未読バッジ・通知一覧（Realtime）
- [ ] PWA: `app/manifest.ts`、アイコン、`public/sw.js`
- [ ] Web Push の購読登録・解除、種類ごとの ON/OFF、iOS 向けのホーム画面追加の案内

## M4. 宣言・休息日
- [ ] RPC `declare_goal` / `register_rest_day` / `cancel_rest_day`
- [ ] 宣言フォーム・休息日カレンダー

## M5. 提出・AI 判定
- [ ] クライアントでの画像圧縮とアップロード
- [ ] RPC `create_submission` / `record_judgement` / `record_judge_error`
- [ ] `/api/judge`（Gemini、structured output）
- [ ] 結果の表示・再提出・再判定

## M6. 定期実行・宣言なし
- [ ] RPC `run_declaration_reminders` / `close_declarations` / `close_overdue_logs` / `due_submit_reminders`
- [ ] `/api/cron/tick`
- [ ] pg_cron + pg_net + Vault の設定（マイグレーションと手順書）

## M7. 理由申告・審査・精算
- [ ] RPC `file_failure_report` / `review_excuse` / `expire_reports` / `expire_reviews`（P3 の連続回数のテストを厚めに）
- [ ] 理由申告フォーム、審査画面（納得 / 納得できない）
- [ ] `penalty_summary` ビュー、RPC `run_monthly_settlement` / `mark_settlement_sent` / `confirm_settlement`
- [ ] 支払先の設定、精算ページ（PayPay ボタン、送金した・受け取った）

## M8. ダッシュボード・履歴
- [ ] 本日のステータスカード、ランキング、タイムライン
- [ ] メンバー履歴、学習ログ詳細（署名付き URL で画像を表示）
- [ ] グループ設定（admin）

## M9. 本番化
- [ ] Supabase 本番プロジェクト、Vercel のデプロイと環境変数
- [ ] 画像の保持期間による削除
- [ ] メンバーへの案内（ホーム画面に追加、通知の許可、Gemini 無料枠のデータの扱い）
