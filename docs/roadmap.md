# 実装ロードマップ

各マイルストーンは「動く状態でマージできる」単位にする。チェックが付いたら次へ進む。

## M0. 環境構築 ✅
- [x] Next.js 16 (App Router, TS, Tailwind v4) の雛形
- [x] git / CLAUDE.md / .claude / docs / README / .env.example

## M1. 基盤
- [ ] 依存関係を追加: `@supabase/ssr` `@supabase/supabase-js` `zod` `@google/genai` `web-push` `browser-image-compression` `@tanstack/react-table`、shadcn/ui の初期化（Chart = Recharts を含む）
- [ ] Supabase CLI でローカル開発環境（`supabase init` / `supabase start`）
- [ ] `src/lib/env.ts`（環境変数を zod で検証）、`src/lib/time.ts`（JST）
- [ ] `src/lib/supabase/{client,server,admin,proxy}.ts`、`src/proxy.ts`
- [ ] マイグレーション: 全テーブル・制約・RLS・列単位 GRANT・Storage バケットとポリシー
- [ ] `supabase gen types` → `src/types/database.ts`

## M2. 認証・プロフィール
- [ ] ログイン / 招待コードつきサインアップ（ADR-006）
- [ ] profile の自動作成トリガー、最初のユーザーを admin にする
- [ ] プロフィール編集（表示名・アバター・PayPay リンク）
- [ ] お試し期間（`trial_ends_at`）
- [ ] 管理者による仮パスワードの発行

## M3. 通知基盤（後の機能はすべてこれを使うので先に作る）
- [ ] `activity_events` → `notifications` の配信 (`lib/notify`)
- [ ] ベル・未読バッジ・通知一覧（Realtime）
- [ ] PWA: `app/manifest.ts`、アイコン、`public/sw.js`
- [ ] Web Push の購読登録・解除
- [ ] **通知ゲート (F0)**: ホーム画面追加（iOS）→ 許可 → 購読 → テスト通知 → バナー・サウンドの確認。開くたびに再確認

## M4. 宣言・休息日
- [ ] RPC `declare_goal`（合言葉の発行、`day_at` などの共通関数を含む） / `register_rest_day` / `cancel_rest_day`
- [ ] 宣言フォーム・休息日カレンダー
- [ ] 宣言への指摘: RPC `flag_declaration` / `revise_declaration` / `expire_revisions`、書き直しフォーム
- [ ] 休会: RPC `request_leave` / `cancel_leave`、申請・審査画面

## M5. 証拠・提出・AI 判定
- [ ] クライアントでの画像圧縮とアップロード
- [ ] RPC `create_submission` / `record_judgement` / `record_judge_error`
- [ ] `/api/judge`（Gemini、structured output、合言葉の確認）
- [ ] 結果の表示・再提出・再判定・経過時間の表示
- [ ] 「怪しい」指摘: RPC `flag_submission` / `resend_evidence` / `withdraw_flag`、最終審査

## M6. 定期実行・宣言なし
- [ ] RPC `run_declaration_reminders` / `close_declarations` / `expire_revisions` / `close_overdue_logs` / `due_submit_reminders` / `confirm_passed_logs` / `advance_disputes` / `due_deadline_reminders`
- [ ] `/api/cron/tick`
- [ ] pg_cron + pg_net + Vault の設定（マイグレーションと手順書）

## M7. 理由申告・審査・精算
- [ ] RPC `file_failure_report` / `cast_review`（理由・休会・疑義で共通） / `expire_reports` / `expire_reviews`（P3 の連続回数のテストを厚めに）
- [ ] 理由申告フォーム、審査画面（納得 / 納得できない）
- [ ] `penalty_summary` ビュー、RPC `run_weekly_settlement` / `mark_settlement_sent` / `confirm_settlement`
- [ ] 支払先の割り当て（管理者が入力）、精算ページ（PayPay ボタン、送金した・受け取った・届いていない）、未払いへの P7

## M8. ダッシュボード・振り返り
- [ ] 本日のステータスカード、ランキング、タイムライン
- [ ] 記録の保全: 履歴テーブルの DELETE 禁止・UPDATE 制限のトリガー（M1 のマイグレーションに含めてもよい）
- [ ] ビュー `daily_history` / `weekly_stats` / `user_stats` / `received_objections`
- [ ] 振り返り画面: 数字のカードと G2〜G10 のグラフ・表、その日の詳細（1 日のタイムライン、署名付き URL / サムネイル）、次の計画の追跡
- [ ] グループの比較画面: G11〜G14
- [ ] 検索（`pg_trgm`）
- [ ] 週の振り返り: RPC `create_weekly_reviews`、Gemini の要約、振り返りメモ
- [ ] 書き出し `/api/export`（CSV / JSON）
- [ ] グループ設定（admin）

## M9. 本番化
- [ ] Supabase 本番プロジェクト、Vercel のデプロイと環境変数
- [ ] 画像の保持期間による削除
- [ ] メンバーへの案内（ホーム画面に追加、通知の許可、Gemini 無料枠のデータの扱い）
