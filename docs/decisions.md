# 設計判断の記録 (ADR)

新しい判断は末尾に追記する。考えが変わったときは古い項目を消さず、Status を `Superseded by ADR-xxx` にする。

---

## ADR-001: 通知はアプリ内通知 + Web Push で完結させる
- **Status**: Accepted (2026-10-16)
- **Context**: 当初の仕様は Discord Webhook で晒し上げる設計だった。オーナーの要望は「外部ツールは使いたくない、アプリ内で完結させたい」。
- **Decision**: 通知の正本は DB の `notifications`（アプリ内のベル・一覧。Supabase Realtime で即時反映）。アプリを閉じているときは PWA の Web Push（VAPID + `web-push`）で届ける。晒し上げはダッシュボードのタイムラインで行う。
- **Consequences**:
  - iOS で Push を受け取るには **iOS 16.4 以降でホーム画面に追加**する必要がある。オンボーディングで案内する。
  - Push は届くことが保証されない（OS の省電力機能・通知の拒否）。アプリ内通知を正本にして、Push は「おまけ」として扱う。
  - 外部サービスのアカウントは不要。費用も 0 円のまま。

## ADR-002: Gemini のモデルは環境変数で指定する
- **Status**: Accepted (2026-10-16)
- **Context**: 当初の仕様の `gemini-2.0-flash` は 2026-06-01 に提供終了している。無料枠で使えるモデルやレート制限は頻繁に変わる（2026-04 以降、Pro 系は無料枠の対象外）。
- **Decision**: `GEMINI_MODEL` 環境変数でモデル ID を指定する。既定は無料枠のある Flash 系の最新版（実装時に Google AI Studio で ID を確認する）。SDK は `@google/genai`。出力は `responseMimeType: application/json` + `responseSchema` で `{score, feedback}` に固定する。
- **Consequences**: モデルの提供終了はコードを変えずに環境変数の変更だけで対応できる。判定のたびに使ったモデルを `submissions.ai_model` に残す。

## ADR-003: 定期実行は Supabase pg_cron で行う（GitHub Actions は使わない）
- **Status**: Accepted (2026-10-16)
- **Context**: 当初の仕様は GitHub Actions を 15 分ごとに実行する設計だった。
  - private リポジトリの無料枠は月 2,000 分で、ジョブ 1 回ごとに 1 分単位で切り上げて課金される。15 分ごとだと月 ~2,900 回になり、**無料枠を超える**。
  - public リポジトリなら無料だが、スケジュール実行は数十分遅れることがよくあり、60 日間活動がないと自動で無効になる。
  - Vercel Hobby の Cron は 1 日 1 回まで。
- **Decision**: Supabase Free に含まれる `pg_cron` + `pg_net` で、5 分ごとに `POST /api/cron/tick` を呼ぶ。シークレットは Supabase Vault に置く。
- **Consequences**: リポジトリの公開・非公開に関係なく 0 円で動く。tick は冪等に作るので、取りこぼしや重複があっても問題ない。

## ADR-004: 書き込みはサーバーだけが行い、状態遷移は Postgres 関数に集める
- **Status**: Accepted (2026-10-16)
- **Context**: 当初の RLS では、ユーザーが自分の `total_penalty_points` や `status`・`ai_score` を直接書き換えられた。罰ゲームアプリでは改ざんへの耐性が肝になる。
- **Decision**: `authenticated` ロールに許可する書き込みは、プロフィールの表示項目・通知の既読・自分のフォルダへの画像アップロードだけ。それ以外は Server Action / Route Handler が service role で RPC を呼ぶ。RPC は `service_role` だけが実行できる。
- **Consequences**: 検証ロジックが DB に 1 か所だけになり、cron と画面操作で同じルールが使われる。そのぶん SQL の量は増えるので、pgTAP などで RPC のテストを書く。

## ADR-005: ポイントは台帳で管理する
- **Status**: Accepted (2026-10-16)
- **Decision**: `profiles` にカウンター列を持たせず、`penalties`（1 行 = 1pt、`study_log_id` が unique）から集計する。精算済みかどうかは `settlement_id` で判断する。
- **Consequences**: 二重ペナルティは一意制約で防げる。精算でどの失敗が消化されたかも追える。

## ADR-006: 招待コード + サーバー側でユーザーを作成する
- **Status**: Accepted (2026-10-16)
- **Decision**: Supabase の公開サインアップは OFF。サインアップ用の Server Action で `INVITE_CODE` を定数時間比較し、通ったら `auth.admin.createUser({ email_confirm: true })` で作る。
- **Consequences**: anon key で Auth API を直接呼んでも登録できない。確認メールを送らないので、Supabase 無料枠のメール送信上限の影響も受けない。

## ADR-007: 日付は JST 固定、締切は提出時刻で判定する
- **Status**: Accepted (2026-10-16)
- **Decision**: 学習日は `(now() at time zone 'Asia/Tokyo')::date`。提出の締切判定は `submissions.submitted_at < target_end_time` で行う（AI 判定がいつ終わったかは問わない）。判定待ちの間は cron が `judge_grace_minutes` だけ失敗の確定を待つ。
- **Consequences**: 締切直前に提出した人が、Gemini の遅延のせいで失敗にならない。
