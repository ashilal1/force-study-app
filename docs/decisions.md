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
- **Status**: Accepted (2026-10-16)。ADR-008 で 1 行 = 1pt から 1 行 = 任意の額に変更
- **Decision**: `profiles` にカウンター列を持たせず、`penalties`（`study_log_id` が unique）から集計する。精算済みかどうかは `settlement_id` で判断する。
- **Consequences**: 二重ペナルティは一意制約で防げる。精算でどの失敗が消化されたかも追える。

## ADR-006: 招待コード + サーバー側でユーザーを作成する
- **Status**: Accepted (2026-10-16)
- **Decision**: Supabase の公開サインアップは OFF。サインアップ用の Server Action で `INVITE_CODE` を定数時間比較し、通ったら `auth.admin.createUser({ email_confirm: true })` で作る。
- **Consequences**: anon key で Auth API を直接呼んでも登録できない。確認メールを送らないので、Supabase 無料枠のメール送信上限の影響も受けない。

## ADR-007: 日付は JST 固定、締切は提出時刻で判定する
- **Status**: Accepted (2026-10-16)
- **Decision**: 学習日は `(now() at time zone 'Asia/Tokyo')::date`。提出の締切判定は `submissions.submitted_at < target_end_time` で行う（AI 判定がいつ終わったかは問わない）。判定待ちの間は cron が `judge_grace_minutes` だけ失敗の確定を待つ。
- **Consequences**: 締切直前に提出した人が、Gemini の遅延のせいで失敗にならない。

## ADR-008: ペナルティは 1pt = 1 円とし、失敗の種類と理由で額を変える
- **Status**: Accepted (2026-10-16)
- **Context**: 当初の設計は「失敗 1 回 = 1pt、3pt ごとに全員へ 500 円」だった。オーナーの要望は「払う金額とポイントを同じにする」「失敗には理由を書かせ、理由によって扱いを変える」。
- **Decision**: 宣言なし 500pt、サボり 700pt、「宣言が妥当じゃなかった」は次の計画を書けば 0pt（4 回連続から 500pt）、「急遽予定・その他」はほかの全員が納得すれば 0pt（1 人でも拒否、または 24 時間でそろわなければ 500pt）、申告しなければサボり扱い。未達成の後処理は `failure_reports` と `excuse_reviews` で状態を持つ。金額はグループ設定で変えられる。
- **Consequences**:
  - 「未達成」がすぐにペナルティ確定ではなくなるので、未達成 → 申告待ち → 審査中 → 確定、という状態が増える。期限切れは cron が処理する。
  - 全員一致が必要なので、1 人が審査を放置すると承認されない。審査締切の 3 時間前に、まだ押していない人へリマインドを送る。
  - 「宣言が妥当じゃなかった」を選び続ける逃げ道は、連続回数の上限で塞ぐ。

## ADR-009: 精算は月の最終日に、支払先 1 人へまとめて払う
- **Status**: Superseded by ADR-010
- **Decision**: 月の最終日の 09:00 に、確定済みの未精算ポイントを人ごとに合計して `settlements` を 1 件作る。支払先は本人があらかじめ決めた人（`profiles.payee_id`）で、未設定ならほかのメンバーからランダムに 1 人選ぶ。送金した側が「送金した」、受け取った側が「受け取った」を押して完了。
- **Consequences**: 送金は 1 人あたり月 1 回で済む。審査中のものなど、その時点で確定していないペナルティは翌月に回る。ランダムの結果は記録し、選び直せないようにする。

## ADR-010: 精算は毎週土曜 23:00 に行う
- **Status**: Accepted (2026-10-16)
- **Context**: 月 1 回だと、ペナルティから支払いまでが最大 1 か月空き、痛みが薄れる。
- **Decision**: ADR-009 の仕組み（支払先 1 人、未設定ならランダム、送金した / 受け取った）はそのままにして、締めを毎週土曜 23:00 (JST) にする。休息日の上限を数える週も日曜〜土曜にして、精算と区切りを揃える。
- **Consequences**: 送金は 1 人あたり最大で週 1 回になる。土曜当日の未達成は 23:00 の時点では確定していないことが多く、翌週の分に入る。
