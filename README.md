# Commit or Treat (仮)

友人どうしで学習をサボれなくするための、身内向け Web アプリ（PWA）。

1. **朝に宣言** — 今日やることと締切時刻を決める。12:00 までに宣言しなければ 500pt
2. **成果物を提出** — 写真に「今日の合言葉」を写して送る。振り返りも書く
3. **AI が判定** — Gemini が宣言と照らし合わせて採点する。70 点以上かつ合言葉ありで合格、締切までなら 3 回まで再提出できる。合格から 3 時間は、ほかのメンバーが「怪しい」を押せる
4. **できなかったら理由を申告** — サボりは 700pt。「宣言が妥当じゃなかった」は次の計画を書けば 0pt（4 回連続から 500pt）。「急遽予定・その他」はほかの全員が納得すれば 0pt、だめなら 500pt
5. **毎週土曜 23:59 に精算** — 1pt = 1 円。その週のぶんを支払先 1 人に PayPay でまとめて払う

通知はアプリ内のベルと Web Push で届く（通知を ON にしないと使えない）。外部のチャットツールは使わない。運用費は 0 円。登録から次の日曜まではお試し期間でペナルティなし。

## ドキュメント
| | |
|---|---|
| [要件定義](docs/requirements.md) | ルールと機能 |
| [アーキテクチャ](docs/architecture.md) | 構成図・処理の流れ・ディレクトリ構成 |
| [データベース](docs/database.md) | テーブル・RPC・RLS |
| [設計判断 (ADR)](docs/decisions.md) | なぜこの構成にしたか |
| [ロードマップ](docs/roadmap.md) | 実装の進み具合 |

## 技術スタック
Next.js 16 / React 19 / TypeScript / Tailwind CSS v4 / shadcn/ui ・ Supabase（Postgres・Auth・Storage・Realtime・pg_cron）・ Gemini API ・ Web Push ・ Vercel

## ローカル開発

必要なもの: Node.js 22 以上（supabase-js が 20 以下を非推奨にした）、[Supabase CLI](https://supabase.com/docs/guides/cli)、Supabase の開発用プロジェクト（無料プラン。リージョンは Tokyo）

```bash
npm install
cp .env.example .env.local          # 値を埋める（下記）
supabase login
supabase link --project-ref <開発用プロジェクトの ref>
supabase db push                    # マイグレーションを適用
npm run dev                         # http://localhost:3000
```

### 環境変数
| 変数 | 取得元 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` | Supabase ダッシュボード → Project Settings → API Keys |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | [Google AI Studio](https://aistudio.google.com/apikey) で API キーを作る（無料枠）。モデル ID は無料枠のある Flash 系（AI Studio のモデル一覧で確かめる。常に最新の Flash を使うなら `gemini-flash-latest`） |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | `npx web-push generate-vapid-keys`。`VAPID_SUBJECT` は `mailto:` か公開用の `https://` URL。鍵を変えると全端末の購読が無効になるので、作ったら変えない |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `INVITE_CODE` | グループが 1 つもない新しい環境で、最初のグループを作るためだけのコード（任意。自分で決める。4 文字以上）。ふだんは、ログインした人が参加画面の「新しいグループを作る」から作るか、メンバーが発行する招待コードで入る（ADR-034） |

### Google ログインの設定（無料）
1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作る
2. 「Google Auth Platform」（OAuth 同意画面）を設定する。対象は「外部」、スコープは `openid` / `email` / `profile` だけ（審査不要）。公開ステータスを「本番環境」にする（「テスト」のままだと登録したテストユーザーしかログインできない）
3. 「クライアント」で OAuth クライアント ID を作る（種類: ウェブ アプリケーション）。承認済みのリダイレクト URI に `https://<project-ref>.supabase.co/auth/v1/callback` を入れる
4. Supabase ダッシュボード → Authentication → Sign In / Providers → Google を有効にして、クライアント ID とシークレットを貼る
5. Supabase ダッシュボード → Authentication → URL Configuration の Redirect URLs に `http://localhost:3000/auth/callback`（本番では本番の URL も）を追加する

Web Push はローカルでも `localhost` なら試せる。iPhone で試すには HTTPS で公開し、ホーム画面に追加する必要がある。

## デプロイ（Vercel Hobby）

ブランチと環境を 2 段に分ける（ADR-027）。

| ブランチ | Vercel の環境 | URL | Supabase |
|---|---|---|---|
| `main` | Production（公開用） | https://force-study-app.vercel.app | 共有（ADR-031） |
| `develop` | Preview（テスト用） | https://force-study-app-staging.vercel.app（`develop` に割り当てたドメイン） | 共有 |
| 作業ブランチ | Preview | コミットごとの URL | 共有 |

Supabase の無料プロジェクトは 1 人 2 つまでなので、本番・テスト用・ローカルで 1 つのプロジェクトを共有する（ADR-031）。テスト用 URL やローカルでの操作も本物の記録になるので、表示の確認にとどめる。

普段の流れ: 作業ブランチ → `develop` に PR してマージ → テスト用 URL で確かめる（iPhone もここで）→ `develop` → `main` に PR してマージ → 公開用 URL に出る。

### 初回だけ
1. [Vercel](https://vercel.com) に GitHub アカウントでサインアップ（Hobby）。「Add New → Project」でこのリポジトリを Import する（非公開リポジトリなので Vercel の GitHub アプリに許可を出す）。Production Branch は `main`
2. Import 画面の Environment Variables に、`.env.local` と同じ値を入れる（対象は Production と Preview の両方。今使うのは下の 3 つ。ほかは使う機能ができたら足す）
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`（通知。M3 から）
   - `GEMINI_API_KEY` / `GEMINI_MODEL`（AI 判定。M5 から）
   - `CRON_SECRET`（定期実行。M6 から）
3. Deploy。関数は `vercel.json` で東京（`hnd1`）に置く（Supabase と同じリージョン）
4. Settings → Deployment Protection → Vercel Authentication を **オフ**にする。Hobby の既定では `main` 以外の URL に Vercel のログインが要り、iPhone のホーム画面アプリ（Safari とログイン状態を共有しない）からテスト用 URL を開けない。アプリ自体は Google ログインと招待コードで守られている
5. Settings → Domains で `force-study-app-staging.vercel.app` を追加し、Git Branch に `develop` を指定する（自動で付くブランチ URL は長く、途中が省略されるため）
6. Supabase ダッシュボード → Authentication → URL Configuration
   - Redirect URLs に、公開用とテスト用の両方の `https://<ドメイン>/auth/callback` を追加
   - Site URL を公開用の `https://<本番のドメイン>` にする（Redirect URLs に合わない戻り先が来たときの行き先）
7. Google Cloud の OAuth クライアントは変更不要（戻り先は Supabase の `/auth/v1/callback` のまま）

### 定期実行（pg_cron）
マイグレーションが `pg_cron` と `pg_net` を有効にして、5 分ごとのジョブ `tick` を登録する。どのデプロイを呼ぶかとシークレットは、**Supabase のプロジェクトごとに** Vault に入れる（SQL Editor か `supabase db query --linked` で 1 回だけ。シークレットを Git に入れない）。

```sql
select vault.create_secret('<CRON_SECRET と同じ値>', 'cron_secret', 'Bearer token for /api/cron/tick');
select vault.create_secret('https://<このプロジェクトを使うデプロイ>/api/cron/tick', 'tick_url', 'Deployment that runs the tick');
```

- `tick_url` は公開用の URL（`https://force-study-app.vercel.app/api/cron/tick`）にする。テスト用は呼ばない（ADR-031）
- `CRON_SECRET` は Vercel の環境変数（Production と Preview）にも同じ値を入れる
- 動いているかは `select * from cron.job_run_details order by start_time desc limit 5;` と `select status_code, created from net._http_response order by created desc limit 5;` で確かめる

### 注意
- `NEXT_PUBLIC_` の変数はビルド時に埋め込まれる。値を変えたら再デプロイする
- Supabase の値は Production・Preview とも同じ（ADR-031）。将来本番用プロジェクトを分けたら、Production だけを差し替えて `tick_url` も変える
