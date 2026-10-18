import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PageLoading } from "@/components/app/page-loading";
import { actionButtonVariants } from "@/components/brand/action-button";
import { Countdown } from "@/components/brand/countdown";
import { Pill } from "@/components/brand/pill";
import { Stamp } from "@/components/brand/stamp";
import { Sticker } from "@/components/brand/sticker";
import { FlagList } from "@/components/declare/flag-list";
import { GiveUpButton } from "@/components/declare/give-up-button";
import { PassphraseCard } from "@/components/declare/passphrase-card";
import { ReviseForm } from "@/components/declare/revise-form";
import { MakeupDeclareForm } from "@/components/makeup/makeup-declare-form";
import { FlagForm } from "@/components/today/flag-form";
import { getMakeupBoard, suggestedDeclaration, type MakeupBoard, type MakeupSession } from "@/lib/makeup";
import { formatJstDateTime, formatJstDay, formatJstTime } from "@/lib/time";

export const metadata: Metadata = { title: "補習 | Commit or Treat" };

// Makeup study (補習, F8b): what the viewer owes and their running session, then everyone
// else's running sessions (to flag them as too light).
export default function MakeupPage() {
  return (
    <div className="grid gap-6">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">補習</h1>
      <Suspense fallback={<PageLoading />}>
        <Makeup />
      </Suspense>
    </div>
  );
}

async function Makeup() {
  const board = await getMakeupBoard();
  if (!board.enabled) {
    return (
      <Notice title="このグループでは補習を使っていません">
        サボりが続いたときに追加の学習を科す仕組みです。使うときは、管理者が設定画面で「補習を使う」をオンにします。
      </Notice>
    );
  }

  return (
    <>
      <Balance board={board} />
      {board.active ? <ActiveSession session={board.active} now={board.now} /> : <Declare board={board} />}
      <Debts board={board} />
      <Others board={board} />
      <History sessions={board.history} />
      <p className="m-0 text-xs text-sub">
        サボり（宣言なし・サボった・理由を申告しなかった・書き直さなかった）が 3 回続くと、3 回目から 1
        回ごとに補習が 1 回付きます。期限はその週の次の週の土曜です。過ぎると毎週 1 回ずつ増えます。
      </p>
    </>
  );
}

function Balance({ board }: { board: MakeupBoard }) {
  const { balance } = board;
  if (balance.owed === 0 && balance.trialOwed === 0) {
    return <Notice title="補習はありません">このままサボらずに続けましょう。</Notice>;
  }
  return (
    <Sticker tone={balance.overdue > 0 ? "red" : "tape"} className="grid gap-2 px-4 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <b className="text-lg">残り {balance.remaining} 回</b>
        <span className="text-sm font-bold">
          返した {balance.completed + balance.reviewing} / {balance.owed} 回
        </span>
      </div>
      {balance.nextDueAt && balance.remaining > 0 ? (
        <span className="text-sm font-bold">
          {balance.overdue > 0 ? `期限切れが ${balance.overdue} 回あります（逃走中）。` : ""}
          次の期限 {formatJstDateTime(balance.nextDueAt)}
          {balance.overdue === 0 ? (
            <>
              {" "}
              （あと <Countdown until={balance.nextDueAt} />）
            </>
          ) : null}
        </span>
      ) : null}
      {balance.reviewing > 0 ? (
        <span className="text-xs font-medium">「怪しい」の受付中の補習 {balance.reviewing} 回も、返した数に入れています。</span>
      ) : null}
      {balance.trialOwed > 0 ? (
        <span className="text-xs font-medium">お試し期間なので、本番なら補習 {balance.trialOwed} 回でした（返さなくて大丈夫です）。</span>
      ) : null}
    </Sticker>
  );
}

function Declare({ board }: { board: MakeupBoard }) {
  const { balance } = board;
  if (balance.remaining - balance.open <= 0) return null;
  if (board.declaredToday) {
    return <Notice title="今日の補習は宣言済みです">補習は 1 日 1 回まで。明日また宣言してください。</Notice>;
  }
  return (
    <section className="grid gap-3">
      <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">補習を宣言する</h2>
      <Sticker className="px-4 py-4">
        <MakeupDeclareForm suggested={suggestedDeclaration(board)} hours={board.settings.makeupHours} />
      </Sticker>
    </section>
  );
}

function ActiveSession({ session, now }: { session: MakeupSession; now: number }) {
  const revising = Boolean(session.revisionDueAt && !session.revisedAt && now < new Date(session.revisionDueAt).getTime());
  return (
    <section className="grid gap-4">
      <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">いまの補習</h2>
      <Sticker className="grid gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <Pill variant="outline">宣言 {formatJstDateTime(session.declaredAt)}</Pill>
          {session.status === "pending" ? (
            <span className="text-right text-sm font-bold">
              提出締切 {formatJstDateTime(session.targetEndTime)}
              <br />
              <span className="font-en text-lg">
                あと <Countdown until={session.targetEndTime} />
              </span>
            </span>
          ) : (
            <Stamp tone="mint" label="合格" sub={session.passedScore !== null ? `${session.passedScore} 点` : undefined} />
          )}
        </div>
        <p className="m-0 text-[1.05rem] leading-snug font-bold whitespace-pre-wrap">{session.declaration}</p>
        {session.originalDeclaration ? (
          <p className="m-0 text-sm text-sub">
            書き直す前: <s>{session.originalDeclaration}</s>
          </p>
        ) : null}
        {session.status === "pending" ? <PassphraseCard value={session.passphrase} /> : null}
        {session.status === "passed" ? (
          <p className="m-0 text-sm font-medium">
            {session.dispute
              ? "「怪しい」と指摘されています。証拠の送り直しや審査はこの日の詳細から。"
              : `${session.disputeWindowEndsAt ? formatJstDateTime(session.disputeWindowEndsAt) : ""} まで「怪しい」がなければ、1 回返したことになります。`}
          </p>
        ) : null}
      </Sticker>

      {session.flags.length > 0 ? (
        <section className="grid gap-2">
          <div className="flex items-center gap-3">
            <Stamp tone="red" label="指摘" className="text-lg" />
            <span className="text-sm font-bold">
              {session.revisedAt ? `${formatJstDateTime(session.revisedAt)} に書き直しました` : "補習の宣言が軽すぎると指摘されました"}
            </span>
          </div>
          <FlagList flags={session.flags} />
        </section>
      ) : null}

      {revising ? (
        <Sticker className="px-4 py-4">
          <ReviseForm logId={session.id} current={session.declaration} dueAt={session.revisionDueAt!} />
        </Sticker>
      ) : null}

      {session.status === "pending" ? (
        <>
          <Link href="/submit?makeup=1" className={actionButtonVariants({ tone: "mint" })}>
            <span>補習を提出する</span>
            <span className="font-sans text-xs font-bold">合言葉を紙に書いて、成果物と一緒に撮る</span>
          </Link>
          {session.latest?.status !== "judging" ? <GiveUpButton logId={session.id} makeup /> : null}
        </>
      ) : (
        <Link href={`/logs/${session.id}`} className={actionButtonVariants({ tone: "white" })}>
          提出の詳細を見る
        </Link>
      )}
    </section>
  );
}

function Debts({ board }: { board: MakeupBoard }) {
  if (board.debts.length === 0) return null;
  return (
    <section className="grid gap-2">
      <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">補習が付いた理由</h2>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {board.debts.map((debt) => (
          <li key={debt.id} className="rounded-[10px] border-2 border-ink bg-card px-3 py-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <b>
                {debt.reason === "slack_streak"
                  ? `${debt.date ? formatJstDay(debt.date) : ""} サボりが続いた`
                  : `${debt.periodEnd ? formatJstDay(debt.periodEnd) : ""} の締めで期限切れ`}
                {debt.waived ? "（お試し期間なので数えない）" : ""}
              </b>
              <span className="shrink-0 font-bold">+{debt.count} 回</span>
            </div>
            {debt.waived ? null : <span className="text-xs text-sub">期限 {formatJstDateTime(debt.dueAt)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Others({ board }: { board: MakeupBoard }) {
  if (board.others.length === 0) return null;
  return (
    <section id="others" className="grid gap-2">
      <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">みんなの補習</h2>
      {board.others.map((session) => (
        <Sticker key={session.id} shadow="sm" className="grid gap-2 px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <b>{session.name} さん</b>
            <span className="text-xs text-sub">
              {session.status === "pending" ? `締切 ${formatJstDateTime(session.targetEndTime)}` : "合格・確認中"}
            </span>
          </div>
          <p className="m-0 text-sm font-bold whitespace-pre-wrap">{session.declaration}</p>
          {session.canFlag ? <FlagForm logId={session.id} ownerName={session.name} /> : null}
          {session.status === "passed" ? (
            <Link href={`/logs/${session.id}`} className="text-sm font-bold underline underline-offset-2">
              提出を見る（怪しければ指摘する）→
            </Link>
          ) : null}
        </Sticker>
      ))}
    </section>
  );
}

const SESSION_RESULT: Record<string, string> = {
  completed: "返した",
  passed: "確認中",
  missed: "数えない",
  invalidated: "証拠不認定",
};

function History({ sessions }: { sessions: MakeupSession[] }) {
  if (sessions.length === 0) return null;
  return (
    <section className="grid gap-2">
      <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">これまでの補習</h2>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {sessions.map((session) => (
          <li key={session.id}>
            <Link href={`/logs/${session.id}`} className="block rounded-[10px] border-2 border-ink bg-card px-3 py-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-sub">
                  {formatJstDay(session.date)} {formatJstTime(session.declaredAt)}
                </span>
                <b>{SESSION_RESULT[session.status] ?? session.status}</b>
              </div>
              <p className="m-0 font-medium">{session.declaration}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Sticker className="grid gap-1 px-4 py-4">
      <b>{title}</b>
      <span className="text-sm font-medium">{children}</span>
    </Sticker>
  );
}
