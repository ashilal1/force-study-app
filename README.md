# Commit or Treat (仮)

友人どうしで学習をサボれなくするための、身内向け Web アプリ（PWA）。

1. **朝に宣言** — 今日やることと締切時刻を決める。12:00 までに宣言しなければ 500pt
2. **成果物を提出** — 証拠画像と振り返りを送る
3. **AI が判定** — Gemini が宣言と照らし合わせて採点する。70 点以上で合格、締切までなら 3 回まで再提出できる
4. **できなかったら理由を申告** — サボりは 700pt。「宣言が妥当じゃなかった」は次の計画を書けば 0pt（4 回連続から 500pt）。「急遽予定・その他」はほかの全員が納得すれば 0pt、だめなら 500pt
5. **月の最終日に精算** — 1pt = 1 円。支払先 1 人に PayPay でまとめて払う

通知はアプリ内のベルと Web Push で届く。外部のチャットツールは使わない。運用費は 0 円。

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

必要なもの: Node.js 20 以上、Docker（ローカルの Supabase 用）

```bash
npm install
cp .env.example .env.local          # 値を埋める（下記）
npx supabase start                  # 表示された URL / キーを .env.local に書く
npx supabase db reset               # マイグレーションと seed を適用
npm run dev                         # http://localhost:3000
```

### 環境変数
| 変数 | 取得元 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | `npx supabase start` の出力、または Supabase ダッシュボード |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | [Google AI Studio](https://aistudio.google.com/)。モデル ID は無料枠のある Flash 系を選ぶ |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | `npx web-push generate-vapid-keys` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `INVITE_CODE` | メンバーに配る招待コード（自分で決める） |

Web Push はローカルでも `localhost` なら試せる。iPhone で試すには HTTPS で公開し、ホーム画面に追加する必要がある。

## デプロイ
未整備。[roadmap](docs/roadmap.md) の M9 で手順を書く。
