# アーキテクチャ

要件は [requirements.md](requirements.md)、DB は [database.md](database.md)、判断の理由は [decisions.md](decisions.md) を参照。

## 1. 全体構成

```mermaid
flowchart LR
    subgraph Client["ブラウザ / PWA (スマホ)"]
        UI["Next.js UI<br/>(RSC + Client Components)"]
        SW["Service Worker<br/>public/sw.js"]
        CMP["browser-image-compression"]
    end

    subgraph Vercel["Vercel Hobby"]
        SA["Server Actions<br/>(宣言・提出・送り直し・休み・理由申告・審査・精算・設定)"]
        JUDGE["Route Handler<br/>/api/judge"]
        TICK["Route Handler<br/>/api/cron/tick"]
        NOTIFY["lib/notify<br/>アプリ内通知 + web-push"]
    end

    subgraph Supabase["Supabase Free"]
        AUTH["Auth"]
        DB[("Postgres + RLS")]
        ST[("Storage<br/>study-evidence (private)")]
        RT["Realtime"]
        CRON["pg_cron + pg_net"]
    end

    GEM["Gemini API<br/>(無料枠)"]
    PUSH["ブラウザの Push サービス<br/>(FCM / APNs / Mozilla)"]

    UI -- "読み取り (publishable key + RLS)" --> DB
    UI -- "画像アップロード (自分のフォルダのみ)" --> ST
    CMP --> UI
    UI -- "書き込み" --> SA
    UI -- "提出後" --> JUDGE
    RT -- "notifications / study_logs の変更" --> UI
    SA & JUDGE & TICK -- "secret key (service_role)" --> DB
    JUDGE -- "画像取得" --> ST
    JUDGE --> GEM
    SA & JUDGE & TICK --> NOTIFY
    NOTIFY --> DB
    NOTIFY --> PUSH --> SW
    CRON -- "5 分ごと POST<br/>Bearer CRON_SECRET" --> TICK
```

### 基本方針
1. **読み取りはクライアントから、書き込みはサーバーから。**
   クライアントは publishable key と RLS で自分のグループのデータを読むだけ。状態を変える操作はすべて Server Action / Route Handler を通し、サーバーが service role で書き込む。これでポイントやステータスの改ざんを構造的に防ぐ（例外はプロフィールの表示項目の更新と、自分のフォルダへの画像アップロードだけ）。
2. **時刻の基準は DB の `now()`。** 「今日」は `(now() at time zone 'Asia/Tokyo')::date`。
3. **状態遷移とペナルティは Postgres 関数にまとめる。** 「未達成にする」「理由申告を確定する」「審査を締める」などを、ペナルティの記録・イベントの記録と同じ 1 トランザクションで行い、一意制約で冪等にする。TypeScript 側は関数を呼んで、返ってきたイベントを通知に回すだけ。
4. **通知は「イベント → 通知 → Push」の一方向。** ドメイン操作は `activity_events` に 1 行書く。`lib/notify` がそこから受信者ごとの `notifications` を作り、Push の設定を見て `web-push` で送る。

## 2. 主要フロー

### 2.1 宣言
```mermaid
sequenceDiagram
    actor U as ユーザー
    participant SA as Server Action declare()
    participant DB as Postgres
    participant N as lib/notify
    U->>SA: 学習内容, 締切時刻 (HH:mm)
    SA->>SA: 認証確認・入力検証 (zod)
    SA->>DB: rpc declare_goal(user, text, time, 合言葉)
    Note over DB: 宣言締切前か / 休息日・休会でないか / 既に宣言していないか<br/>締切の範囲 (+30分〜当日 21:00) を検査して<br/>study_logs と activity_event を insert
    DB-->>SA: event
    SA->>N: dispatch(event)
    N->>DB: notifications insert (本人以外)
    N-->>U: (他のメンバーへ Push / Realtime)
```

### 2.2 提出と AI 判定
```mermaid
sequenceDiagram
    actor U as ユーザー
    participant C as Client
    participant ST as Storage
    participant SA as Server Actions
    participant J as judgeMySubmission<br/>(Server Action → lib/judging)
    participant G as Gemini
    participant DB as Postgres
    Note over U,C: 宣言時に今日の合言葉が発行されている（全員に見える）
    U->>C: 提出写真 1〜3 枚（1 枚以上に合言葉）+ 振り返り
    C->>C: 圧縮 (WebP, 長辺1200px, ~200KB) + 1 枚目のサムネイル (長辺320px, ~20KB)
    C->>ST: upload {user_id}/{date}/{uuid}.webp と _thumb.webp
    C->>SA: createSubmission(paths, text, rating)
    SA->>DB: rpc create_submission()
    Note over DB: pending / 締切前 / 試行回数 を検査<br/>経過時間（宣言→提出）を記録
    SA-->>C: submission_id
    C->>J: judgeMySubmission(submission_id)
    J->>ST: 提出写真を取得
    J->>G: 宣言 + 合言葉 + 写真(inline base64) + テキスト + 経過時間<br/>responseSchema = {score, passphrase_found, feedback}
    alt Gemini 成功
        G-->>J: 結果
        J->>DB: rpc record_judgement()
        Note over DB: 合格 = 70 点以上 かつ 合言葉あり<br/>→ passed（3 時間の「怪しい」受付）
    else Gemini エラー
        J->>DB: submission.status = error (試行回数に数えない)
    end
    J->>J: lib/notify で通知
    J-->>C: 結果
```
- 判定は Server Action `judgeMySubmission` → `lib/judging.ts` の `judgeSubmission()` で同期実行する（Gemini Flash は数秒。Vercel Hobby の関数時間の上限に収まる）。Route Handler は作らない（ADR-030）。
- Gemini への指示は `lib/gemini/judge.ts`。出力は `responseJsonSchema` で `{score, passphrase_found, feedback}` に固定し、zod で検証する。本人の書いた文章は `<submission>` で囲み、指示として扱わないようシステム指示に書く。
- 宣言の書き直し待ちのあいだは判定しない（`revision_pending`）。書き直しが期限切れになったら、判定待ちの提出は `expire_revisions` が取り消す。
- `error` の提出は、本人が「もう一度判定する」を押すか、次の cron tick（M6）が再実行する。試行回数には数えない。

### 2.3 「怪しい」指摘
```mermaid
sequenceDiagram
    actor U as 本人
    actor F as 指摘した人
    actor M as 審査者（ほかの全員）
    participant SA as Server Actions
    participant T as tick
    participant DB as Postgres
    Note over DB: passed（合格から 3 時間）
    F->>SA: 怪しい（理由）
    SA->>DB: rpc flag_submission() → dispute(resending, 1 時間)
    SA-->>U: 「〇〇が怪しいと指摘。1 時間以内なら何度でも送り直せます」
    loop 1 時間以内なら何度でも
        U->>SA: 証拠を送り直す（写真 + 説明）
        SA->>DB: rpc resend_evidence() → lib/judging で合言葉・内容を確認
        SA-->>F: 「送り直しました」
    end
    alt 指摘した全員が取り下げ
        F->>SA: 取り下げる
        SA->>DB: rpc withdraw_flag() → upheld → completed
    else 1 時間たっても取り下げがそろわない
        T->>DB: rpc advance_disputes() → final_review（期限: 24 時間後）
        T-->>M: 「最終審査して」
        M->>SA: 認める / 却下（理由必須）
        SA->>DB: rpc cast_review('dispute')
        Note over DB: 却下 1 件 → invalidated, 200pt (P8)<br/>全員認める or 期限まで却下なし → completed
    end
```
誰も押さないまま 3 時間たったら、tick の `confirm_passed_logs()` が `completed` にする。
- 画面はその日の詳細 `/logs/[id]`（宣言・合言葉・すべての提出の写真と AI の判定・「軽すぎる」「怪しい」・最終審査）。「怪しい」・取り下げ・送り直し・最終審査はここから行い、通知もここへリンクする。

### 2.4 未達成 → 理由申告 → 審査
```mermaid
sequenceDiagram
    actor U as 本人
    actor F as ほかのメンバー
    participant T as /api/cron/tick
    participant SA as Server Actions
    participant DB as Postgres
    T->>DB: rpc close_overdue_logs()
    Note over DB: 提出締切を過ぎた pending → missed<br/>failure_reports(awaiting_report, 期限: 今日 23:00)
    T-->>U: 「理由を申告して」
    U->>SA: 理由（カテゴリ + テキスト）
    SA->>DB: rpc file_failure_report()
    alt サボった
        Note over DB: 700pt → resolved
    else 宣言が妥当じゃなかった
        Note over DB: 連続回数を計算。4 回目以降なら 500pt → resolved
    else 急遽予定 / その他
        Note over DB: under_review。peer_reviews(excuse) の行を作る
        SA-->>F: 審査依頼
        F->>SA: 納得 / 納得できない
        SA->>DB: rpc cast_review('excuse')
        Note over DB: reject → 即却下 500pt<br/>全員 accept → 承認 0pt
        T->>DB: rpc expire_reviews()
        Note over DB: 申告から 24 時間でそろわなければ却下 500pt
    end
    T->>DB: rpc expire_reports()
    Note over DB: 23:00 までに申告なし → not_reported 700pt
```

### 2.5 定期実行 (`/api/cron/tick`)
Supabase の `pg_cron` が 5 分ごとに `pg_net` で `POST /api/cron/tick` を呼ぶ（`Authorization: Bearer <CRON_SECRET>`。シークレットは Supabase Vault に保存）。

tick は以下を順に実行する。各ステップは冪等なので、重複・遅延・取りこぼしがあっても次の tick で回復する。DB 側の手順は `rpc tick()` が 1 つのトランザクションで順に呼び（同時に 2 つ走ったら後のほうは何もしない）、Route Handler はその結果のイベントを `lib/notify` に渡してから、判定待ち・エラーの提出を再判定する。**1〜10 とお試し期間の最終日の通知を実装済み**と 11 の精算（M7）、11b の週の振り返り（M8）。12 は M9 で足す。

| # | 処理 | 実体 |
|---|---|---|
| 1 | 判定待ち（2 分以上）・エラーの提出を再判定（1 回 3 件まで。まだ締まっていない日だけ） | `lib/judging.ts` の `judgeSubmission()` |
| 2 | 0:00・11:00 の宣言リマインド | `rpc run_declaration_reminders()` |
| 3 | 12:00 の宣言なしを確定 (P1) | `rpc close_declarations()` |
| 4 | 書き直しの期限 (P6) と残り 15 分のリマインド | `rpc expire_revisions()` |
| 5 | 提出締切 1 時間前のリマインド | `rpc due_submit_reminders()` |
| 5b | AI が判定できないまま 30 分たった・締切が来た提出を仮合格にする（メンバーが確認。ADR-033） | `rpc pass_unjudged()` |
| 6 | 提出締切（翌日 12:00）超過を未達成にする（判定待ちには 60 分の猶予） | `rpc close_overdue_logs()` |
| 7 | 「怪しい」の受付終了（提出から 24 時間）→ 達成で確定 | `rpc confirm_passed_logs()` |
| 8 | 送り直しの期限 → 最終審査、最終審査の期限 → 確定 | `rpc advance_disputes()` |
| 9 | 理由申告の期限 (P5)、審査の期限（理由 P4・休会） | `rpc expire_reports()` / `rpc expire_reviews()` |
| 10 | 理由申告（期限の日の 22:00・22:45）、休会の審査（22:00・23:00・23:30）、理由・最終審査（期限の 3 時間前・1 時間前）のリマインド | `rpc due_deadline_reminders()` |
| 11 | 毎週土曜 23:59 の精算と、未払いへの P7。同じ tick の 2〜10 のあとに実行し、その時点で決まっているペナルティだけを束ねる（まだ決着していない日の分は次の週。ADR-032） | `rpc run_weekly_settlement()` |
| 11b | 週の振り返りを作り、Gemini で要約を書く（1 回 2 件まで。失敗したら次の tick で再試行） | `rpc create_weekly_reviews()` + `lib/gemini/weekly-summary.ts` |
| 12 | 保持期間を過ぎた原寸の画像、800MB を超えたぶんの古い原寸を削除（サムネイルは残す。1 回 100 件まで。消せなかったら次の tick で再試行） | `rpc due_image_purges()` → Storage API `remove` → `rpc mark_images_purged()` |
| 13 | 2〜11 で返ってきたイベントを通知に回す | `lib/notify` |

tick は 5 分ごとなので、「23:59」の処理（土曜の精算・週の振り返り）は実際には日付が変わった直後の 0:00〜0:05 の tick で、**前の学習日に対して**行う。どの期限も記録された時刻で判定するので、結果は変わらない。

5 分ごとなので、リマインドは最大 5 分遅れる（0:00 のリマインドは 0:00〜0:05 の間に届く）。期限ちょうどの確定も最大 5 分遅れるが、判定は記録された時刻で行うので結果は変わらない。

> Vercel Hobby の Cron は 1 日 1 回までなので使わない。GitHub Actions を使わない理由は ADR-003。

### 2.6 通知
```mermaid
flowchart LR
    E["activity_events<br/>(グループのタイムライン)"] --> R{"受信者を決める<br/>(種類ごとのルール)"}
    R --> NT["notifications<br/>(受信者ごと・既読管理)"]
    NT -- Realtime --> BELL["ベル / 未読バッジ"]
    NT --> WP["web-push → 本人の全端末<br/>(404/410 なら購読を削除 → 次に開いたとき F0 へ)"]
```
- 実装は `src/lib/notify`: `rules.ts`（イベントの種類ごとに受信者と文言を決める純粋な関数）→ `index.ts` の `dispatch(eventId)`（`rpc create_notifications` → 受信者の全端末へ Push → 成功は `record_push_success`、404/410 は `delete_push_subscription`、届いた通知は `mark_notifications_pushed`）。呼び出し側はイベントを記録した RPC のあと `after()` の中で `dispatch` を呼ぶので、画面の応答は待たせない。配信の失敗はログに残すだけで、操作そのものは失敗させない。
- 未読数は下部メニューの「通知」タブのバッジに出す（ヘッダーは置かない）。`notifications` の変更を Realtime（`postgres_changes`。RLS で自分の行だけが届く）で受けて数え直す。通知一覧（`/notifications`）を開くと既読にする。
- F0 のテスト通知だけは `activity_events` を通さず、`lib/notify` の `sendTestPush` がその端末にだけ送る（タイムラインに出す出来事ではないため。ADR-028）。
- Push の本文は短くし、タップで該当ページ（`/logs/{id}` など）を開く。
- 本人の対応が必要な通知は `requireInteraction: true`（タップするまで消えない。Android・PC で有効）。同じ件のリマインドは `tag` をそろえて `renotify: true` で鳴らし直す。音は OS の通知音（Web からは変えられない）。

### 2.7 通知の強制 (F0)
`src/app/(app)/layout.tsx` で、ログイン済みの全画面の手前に「通知ゲート」を置く。
1. サーバー側（`lib/auth.ts` の `hasConfirmedNotifications`）: `profiles.notifications_verified_at` と、確認済み（`verified_at` あり）の `push_subscriptions` があるかを見る。なければ `/onboarding/notifications` へリダイレクト。
2. クライアント側（`NotificationGuard`）: 開くたびに、iOS ならホーム画面から開いたか（`display-mode: standalone`）、`Notification.permission === 'granted'`、`pushManager.getSubscription()` があるか、その endpoint が確認済みか（RLS で自分の端末を読む）を確かめ、だめなら同じ画面へ。
3. 設定画面（`(auth)/onboarding/notifications`。`(app)` の外に置いてゲートの対象にしない）: iOS はホーム画面への追加の手順 → 許可（iOS はタップからしか確認を出せないのでボタン）→ 購読を `rpc save_push_subscription` で登録 → テスト通知 → OS ごとのバナー・サウンド設定の手順 → 本人が「表示され、音も鳴った」を押す → `rpc confirm_push_subscription` が端末と profile に確認時刻を記録。
4. PWA: `app/manifest.ts`（`display: standalone`）、`public/icons/`（`scripts/generate-icons.mjs` で生成）、`public/sw.js`（push の表示と、タップで該当ページを開く。キャッシュはしない。`next.config.ts` でキャッシュ禁止のヘッダーを付ける）。

## 3. 認証とアクセス制御

| 対象 | 方法 |
|---|---|
| セッション | `@supabase/ssr` の Cookie セッション。`src/proxy.ts`（Next.js 16 で middleware から改名）でトークンを更新し、未ログインなら `/login` へ（`/login`・`/auth/callback`・使い方の `/guide` だけは未ログインでも開ける）。proxy はログインの有無だけを見る楽観的なチェック |
| ログイン | Google OAuth（Supabase Auth の Google プロバイダー、PKCE）。`signInWithOAuth` → Google → `/auth/callback` で `exchangeCodeForSession` |
| 招待 | メンバーがホームの「招待コードを発行する」を押すと、Server Action が暗号用の乱数でコードを作り、そのハッシュを `rpc create_invite` で保存して、コードとリンクを画面に返す（ADR-026） |
| 参加 | ログインしただけでは**メンバーではない**。`/join` で招待コードを入れると、Server Action がハッシュにして `rpc join_group` に渡し、招待の照合・使用済みへの更新・profile の作成（発行した人のグループに入れる）を 1 つのトランザクションで行う。同じ画面の「新しいグループを作る」は `rpc create_group` で、作った人が管理者になる（1 人 1 グループ。ADR-034）。`INVITE_CODE` はグループが 1 つもないときだけ使える。profile のない人は何も読めず、メンバーは RLS（`private.my_group()`）で自分のグループの行だけを読む |
| ログイン後の戻り先 | 未ログインで開いたページ（招待リンクなど）は proxy が `/login?next=…` に付け、ログインの開始時に 10 分の httpOnly Cookie に入れ、`/auth/callback` で戻す。同じサイト内のパスだけを受け付ける（`lib/redirect.ts`） |
| メンバーの確認 | `src/lib/auth.ts`（Data Access Layer）の `requireMember()`。自分の profile を RLS 越しに読み、見えなければ `/join` へ。`(app)/layout.tsx` が `<Suspense>` の中で呼ぶので、メンバーでない人にはどのページも描画されない。Server Action も毎回これで確かめ直す |
| DB 読み取り | RLS: **メンバー**（profile があり、抜けていない人）は全行を読める。`notifications` と `push_subscriptions` は本人の行だけ |
| DB 書き込み | `authenticated` ロールには `profiles` の表示項目の update だけを許可（列単位の GRANT）。プロフィール編集の Server Action はこの権限を使い、本人のセッションで書く。それ以外はサーバーの service role が書く |
| Storage | private バケット。insert は `{auth.uid()}/` 配下だけ、select は認証済みユーザー。表示には署名付き URL を使う |
| cron | `CRON_SECRET` との定数時間比較 |
| Gemini | 提出テキストはデータとして扱うようシステム指示に明記（プロンプトインジェクション対策）。合否は点数からサーバーが決める |

## 4. ディレクトリ構成（予定）

```
.
├── CLAUDE.md / AGENTS.md          # AI エージェント向けの規約
├── README.md
├── docs/                          # 要件・設計・ADR
├── supabase/
│   ├── config.toml
│   ├── migrations/                # スキーマ・RLS・RPC・pg_cron（正本）
│   └── seed.sql
├── public/
│   ├── sw.js                      # Service Worker（push / notificationclick）
│   └── icons/                     # PWA アイコン
└── src/
    ├── proxy.ts                   # セッション更新・認証ガード
    ├── app/
    │   ├── manifest.ts            # PWA manifest
    │   ├── (auth)/                # 未ログイン・未参加向け（下部メニューなし）
    │   │   ├── login/             # 「Google でログイン」
    │   │   └── join/              # 招待コードの入力（profile がない人はここへ）
    │   ├── auth/callback/route.ts # OAuth のコード交換
    │   ├── onboarding/notifications/  # 通知ゲート (F0)
    │   ├── (app)/
    │   │   ├── page.tsx           # ダッシュボード
    │   │   ├── declare/           # 宣言
    │   │   ├── submit/            # 提出
    │   │   ├── logs/[id]/         # その日の詳細（1 日のタイムライン）
    │   │   ├── members/[id]/      # 振り返り: カレンダー・統計・指摘と却下の一覧・次の計画の追跡
    │   │   ├── members/[id]/weeks/[weekEnd]/  # 週の振り返り
    │   │   ├── search/            # 学習内容の検索
    │   │   ├── reports/[logId]/   # 理由申告・審査
    │   │   ├── leave/             # 休会の申請・審査
    │   │   ├── settlements/       # 毎週の精算
    │   │   ├── notifications/     # 通知一覧
    │   │   └── settings/          # プロフィール・Push・グループ設定
    │   └── api/
    │       ├── export/route.ts    # 自分の記録の CSV / JSON 書き出し
    │       └── cron/tick/route.ts
    ├── components/
    │   ├── ui/                    # shadcn/ui（Chart・Table を含む）
    │   └── charts/                # G1〜G14 のグラフ（Client Components）と達成カレンダー
    ├── lib/
    │   ├── supabase/              # client.ts / server.ts / admin.ts / proxy.ts
    │   ├── auth.ts                # Data Access Layer: getSessionUser / requireMember
    │   ├── secure-compare.ts      # INVITE_CODE・CRON_SECRET の定数時間比較
    │   ├── invite.ts              # 招待コードの生成・正規化・ハッシュ
    │   ├── today.ts               # 今日のボード（全員の宣言・休息日・休会・指摘）の読み込み
    │   ├── rpc-errors.ts          # RPC が投げる業務エラー → 日本語のメッセージ
    │   ├── redirect.ts            # ログイン後の戻り先の検証
    │   ├── validation/            # フォーム入力の zod スキーマ
    │   ├── gemini/judge.ts        # Gemini への指示・出力スキーマ
    │   ├── judging.ts             # 1 件の提出を判定する（写真の取得 → Gemini → record_judgement）
    │   ├── log-detail.ts          # その日の詳細（/logs/[id]）の読み込みと、見ている人にできること
    │   ├── report-detail.ts       # 理由申告（/reports/[logId]）の読み込みと、連続回数の表示用の計算
    │   ├── todo.ts                # ダッシュボードの「あなたがやること」
    │   ├── timeline.ts            # タイムライン（通知の受信者ルールを、何にも関わっていない人の目線で使う）
    │   ├── group-settings.ts      # 管理者が変えられるグループ設定の一覧
    │   ├── history.ts             # 振り返り（個人・グループ）のデータの読み込み
    │   ├── stats.ts               # 達成率・連続達成日数・平均などの計算（純粋な関数）
    │   ├── chart-colors.ts        # 結果・ペナルティ理由・指摘の色・記号・ラベル
    │   ├── evidence-client.ts     # ブラウザ側: 写真の圧縮（WebP）と Storage へのアップロード
    │   ├── passphrase.ts          # 合言葉の単語リストと生成
    │   ├── notify/                # rules.ts（受信者と文言）・push.ts（web-push）・index.ts（dispatch / sendTestPush）
    │   ├── push-client.ts         # ブラウザ側: Service Worker の登録・購読・端末の判定
    │   ├── time.ts                # JST の日付計算
    │   ├── env.ts                 # 公開してよい環境変数の検証 (zod)
    │   └── env.server.ts          # 秘密の環境変数の検証（機能ごとに遅延して検証）
    ├── actions/                   # Server Actions
    └── types/database.ts          # supabase gen types で生成
```

## 5. 表とグラフの作り方
- グラフは **shadcn/ui の Chart**（中身は Recharts）を使う。色はテーマの CSS 変数から取るので、ダークモードにもそのまま対応する。
- 表は **shadcn/ui の Table + TanStack Table**（並べ替え・絞り込み）。
- 達成カレンダー（G2・G12）はライブラリを使わず、CSS Grid のマス目で作る（軽くて、スマホでも崩れない）。
- データの集計は DB のビュー（`daily_history`・`weekly_stats`・`user_stats`・`received_objections`）で行い、Server Component で取って、グラフの Client Component に渡す。ブラウザでは集計しない。
- 結果の色（達成・未達成・宣言なし・休み）とペナルティ理由の色は 1 か所（`src/lib/chart-colors.ts`）で決め、全グラフで同じ色にする。
- 画面: タイムライン `/timeline`（ホームは最新 5 件。`?before=` で 30 件ずつさかのぼる）、週の振り返り `/members/[id]/weeks/[weekEnd]`（G1・その週の 7 マス・G7・AI のまとめ・本人のメモ）、検索 `/search`（`ilike` + trigram インデックス）、書き出し `/api/export?format=csv|json`（本人の記録だけ。CSV は 1 日 1 行で Excel 用に BOM 付き）、個人の振り返り `/members/[id]`（G1〜G10・次の計画の追跡）、グループの比較 `/review`（G11〜G14。下部メニューの「振り返り」）、その日の詳細 `/logs/[id]` に「この日のタイムライン」。期間は `?range=4w|3m|all`。
- 画面の幅: スマホ（〜767px）は 440px の 1 列。768px からは 720px に広げる。1024px からは、`data-wide` を付けたページ（ホーム・`/review`・`/members/[id]`）だけ 1040px の 2 列にする（`AppShell` が `:has([data-wide])` で判定）。入力フォームは横に伸びすぎないよう 720px のまま。文字は 768px から基準を 106.25%、1024px から 112.5% にする（大きさ・余白は rem なので一緒に大きくなる）。
- TanStack Table は v9（`useTable` + `tableFeatures`）。学習ログの表は並べ替えだけを TanStack に任せ、結果での絞り込みは渡す前に行う。

## 6. 無料枠の見積もり（6 人想定）

| サービス | 無料枠 | 想定使用量 |
|---|---|---|
| Vercel Hobby | 関数の呼び出し・帯域とも十分 | tick 8,640 回/月 + 画面操作 |
| Supabase DB | 500MB | 数 MB/年 |
| Supabase Storage | 1GB | 通常 ~220MB、最悪 ~600MB（800MB 超で古い順に削除） |
| Supabase Realtime | 同時接続 200 | 最大 6 人 × 端末数 |
| Supabase Auth | MAU 50,000 | 6 |
| Gemini（Flash 系） | 1 日あたり数百〜1,500 リクエスト（モデルによる） | 最大 ~30 回/日（判定 + 送り直し） |
| Web Push | 無料（ブラウザベンダーが提供） | 最大 ~100 通/日 |

注意: Supabase Free は **API アクセスのない状態が 7 日続くとプロジェクトが一時停止**する。毎日使っていれば問題ない。
