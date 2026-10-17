# 実装ロードマップ

各マイルストーンは「動く状態でマージできる」単位にする。チェックが付いたら次へ進む。

## M0. 環境構築 ✅
- [x] Next.js 16 (App Router, TS, Tailwind v4) の雛形
- [x] git / CLAUDE.md / .claude / docs / README / .env.example

## M1. 基盤 ✅
- [x] 依存関係を追加: `@supabase/ssr` `@supabase/supabase-js` `zod` `@google/genai` `web-push` `browser-image-compression` `@tanstack/react-table`、shadcn/ui の初期化（Chart = Recharts を含む）
- [x] Supabase CLI の初期化と、クラウドの開発用プロジェクトへの接続（`supabase init` / `supabase link`）
- [x] `src/lib/env.ts`（環境変数を zod で検証）、`src/lib/time.ts`（JST）
- [x] `src/lib/supabase/{client,server,admin,proxy}.ts`、`src/proxy.ts`
- [x] マイグレーション: 全テーブル・制約・RLS・列単位 GRANT・Storage バケットとポリシー
- [x] `supabase gen types` → `src/types/database.ts`

## M2. 認証・プロフィール
- [x] Google ログイン（`/login`、`/auth/callback`）と招待コードでの参加（`/join`、`rpc join_group`）（ADR-025）
- [x] 招待コードをメンバーがその場で発行する（1 回だけ・15 分。ADR-026）
- [ ] iPhone の PWA で Google ログインが戻ってくるかを実機で確認。だめならメールのワンタイムコードを追加
- [x] プロフィール編集（表示名・アバター・PayPay リンク）
- [x] お試し期間（`trial_ends_at`）の表示

## M3. 通知基盤（後の機能はすべてこれを使うので先に作る）
- [x] `activity_events` → `notifications` の配信 (`lib/notify`)。最初のルールは `member_joined`
- [x] 未読バッジ（下部メニューの「通知」）・通知一覧（Realtime）
- [x] PWA: `app/manifest.ts`、アイコン、`public/sw.js`
- [x] Web Push の購読登録・解除（404/410 で自動削除。手動の解除画面はまだ）
- [x] **通知ゲート (F0)**: ホーム画面追加（iOS）→ 許可 → 購読 → テスト通知 → バナー・サウンドの確認。開くたびに再確認
- [ ] iPhone の実機で F0 を確認（ホーム画面から開く → 許可 → テスト通知）

## M4. 宣言・休息日
- [x] RPC `declare_goal`（合言葉の発行、`day_at` などの共通関数を含む） / `register_rest_day` / `cancel_rest_day`
- [x] 宣言フォーム・休息日カレンダー（2 週間ぶん）・ホームに全員の今日
- [x] 宣言への指摘: RPC `flag_declaration` / `revise_declaration` / `expire_revisions`、書き直しフォーム（`expire_revisions` の定期実行は M6）
- [x] 休会: RPC `request_leave` / `cancel_leave` / `cast_review`（leave）/ `expire_reviews`（leave）、申請・審査画面（`expire_reviews` の定期実行は M6）

## M5. 証拠・提出・AI 判定
- [x] クライアントでの画像圧縮とアップロード
- [x] RPC `create_submission` / `record_judgement` / `record_judge_error`
- [x] AI 判定（Gemini、structured output、合言葉の確認）。Route Handler ではなく Server Action + `lib/judging.ts`（ADR-030）
- [x] 結果の表示・再提出・再判定・経過時間の表示
- [x] 「怪しい」指摘: RPC `flag_submission` / `resend_evidence` / `withdraw_flag` / `advance_disputes` / `cast_review('dispute')`、その日の詳細画面 `/logs/[id]`（`advance_disputes` の定期実行は M6）

## M6. 定期実行・宣言なし
- [x] RPC `run_declaration_reminders` / `close_declarations` / `expire_revisions` / `close_overdue_logs` / `due_submit_reminders` / `confirm_passed_logs` / `advance_disputes` / `due_deadline_reminders`（理由申告ぶんは M7）/ `trial_ending_reminders` / `tick`
- [x] `/api/cron/tick`（`CRON_SECRET` で認証、イベントの通知、エラーの提出の再判定）
- [x] pg_cron + pg_net + Vault の設定（マイグレーションと README の手順。開発用プロジェクトはテスト用 URL を呼ぶ）

## M7. 理由申告・審査・精算
- [x] RPC `file_failure_report` / `cast_review`（理由・休会・疑義で共通） / `expire_reports` / `expire_reviews`（P3 の連続回数のテストを厚めに）
- [x] 理由申告フォーム、審査画面（納得 / 納得できない）: `/reports/[logId]`
- [x] `penalty_summary` ビュー、RPC `run_weekly_settlement` / `mark_settlement_sent` / `confirm_settlement` / `report_not_received` / `late_payment_reminders`
- [x] 支払先の割り当て（管理者が入力）、精算ページ（PayPay ボタン、送金した・受け取った・届いていない）、未払いへの P7
- [ ] 全員の支払先がそろうまでお試し期間を終えない（F8）。今は、支払先のない人の精算を持ち越して管理者に通知するだけ

## M8. ダッシュボード・振り返り
- [x] 本日のステータスカード、「あなたがやること」、ランキング（累計・お試しの本番なら・奢り確定・PayPay）、タイムライン
- [x] 記録の保全: 履歴テーブルの DELETE 禁止・UPDATE 制限のトリガー（M1 のマイグレーションで実装済み）
- [x] ビュー `daily_history` / `weekly_stats` / `received_objections`（`user_stats` はビューにせず `lib/stats.ts` で計算）
- [x] 振り返り画面: 数字のカードと G2〜G10 のグラフ・表、その日の詳細（1 日のタイムライン、署名付き URL / サムネイル）、次の計画の追跡
- [x] グループの比較画面: G11〜G14（G11 の小さな折れ線は G13 にまとめた）
- [x] 検索（`pg_trgm`）: `/search`
- [x] 週の振り返り: RPC `create_weekly_reviews`、Gemini の要約、振り返りメモ
- [x] 書き出し `/api/export`（CSV / JSON）
- [x] グループ設定（admin）: RPC `update_group_settings`、設定画面のフォーム

## 運用で変えたこと
- [x] 提出は次の日の宣言の締切（12:00）まで。次の宣言は前の日を片付けてから（「できなかった」→ 理由申告）。「怪しい」・送り直し・審査は 24 時間、理由申告は翌日 23:00（ADR-032）
- [x] AI が判定できないときは仮合格にして、メンバーが確かめる（ADR-033）

## M9. 本番化
- [x] Vercel のデプロイ（`main` を公開用、`develop` をテスト用、東京リージョン。当面は両方とも開発用の Supabase につなぐ。ADR-027）
- [ ] Supabase は今のプロジェクトを本番と共有する（無料枠が 2 つまで。ADR-031）。`tick_url` を公開用 URL に切り替え、仲間を招待する前にテストのデータを消すか決める
- [x] 画像の保持期間による削除: RPC `due_image_purges` / `mark_images_purged`、tick の Route Handler が Storage API で原寸を消す（サムネイルは残す）
- [x] メンバーへの案内: `/guide`（ログイン前でも読める。1 日の流れ・ホーム画面に追加・通知・写真と記録の扱い・ペナルティ）。ログイン画面・設定・招待メッセージからリンク
