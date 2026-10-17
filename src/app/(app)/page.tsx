import { Suspense } from "react";
import Link from "next/link";
import { PageLoading } from "@/components/app/page-loading";
import { Avatar } from "@/components/brand/avatar";
import { actionButtonVariants } from "@/components/brand/action-button";
import { InvitePanel } from "@/components/invite/invite-panel";
import { MemberTodayCard } from "@/components/today/member-today-card";
import { TrialNotice } from "@/components/profile/trial-notice";
import { requireMember } from "@/lib/auth";
import { getMaxMembers, isInTrial, listMembers } from "@/lib/members";
import { getTodayBoard } from "@/lib/today";

// Home: everyone's day (declarations, rest, leave) with 「軽すぎる」. The full dashboard
// (submissions, ranking, timeline) grows on this in M5-M8.
export default function HomePage() {
  return (
    <div className="grid gap-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="m-0 font-en text-[clamp(1.4rem,7vw,1.8rem)] leading-none whitespace-nowrap [text-shadow:3px_3px_0_#fff,5px_5px_0_var(--ink)]">
          COMMIT OR TREAT
        </h1>
        <Suspense fallback={<span className="size-11 rounded-full border-[3px] border-ink bg-card" />}>
          <MyAvatarLink />
        </Suspense>
      </header>
      <Suspense fallback={<PageLoading />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}

async function MyAvatarLink() {
  const me = await requireMember();
  const members = await listMembers();
  return (
    <Link href="/settings" aria-label="プロフィールと設定">
      <Avatar
        name={me.display_name}
        src={me.avatar_url}
        colorIndex={Math.max(0, members.findIndex((member) => member.id === me.id))}
      />
    </Link>
  );
}

async function HomeContent() {
  const [board, maxMembers] = await Promise.all([getTodayBoard(), getMaxMembers()]);
  const me = await requireMember();
  const { members } = board;

  return (
    <>
      {isInTrial(me.trial_ends_at) ? <TrialNotice trialEndsAt={me.trial_ends_at} /> : null}

      {board.me.state.kind === "undeclared" ? (
        <Link href="/declare" className={actionButtonVariants({ tone: "tape" })}>
          <span>今日の宣言をする</span>
          <span className="font-sans text-xs font-bold">締切 {board.settings.declaration_cutoff.slice(0, 5)}</span>
        </Link>
      ) : null}

      <section className="grid gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="m-0 font-en text-[1.4rem] leading-none">TODAY&apos;S MISSIONS</h2>
          <span className="font-en text-base">
            {members.length} / {maxMembers}
          </span>
        </div>
        {members.map((member) => (
          <MemberTodayCard key={member.id} member={member} />
        ))}
      </section>

      {members.length < maxMembers ? <InvitePanel /> : null}
    </>
  );
}
