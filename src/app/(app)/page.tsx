import { Suspense } from "react";
import Link from "next/link";
import { PageLoading } from "@/components/app/page-loading";
import { Avatar } from "@/components/brand/avatar";
import { RankingReceipt, type RankingRow } from "@/components/dashboard/ranking-receipt";
import { Timeline } from "@/components/dashboard/timeline";
import { TodoList } from "@/components/dashboard/todo-list";
import { InvitePanel } from "@/components/invite/invite-panel";
import { PageTip } from "@/components/onboarding/page-tip";
import { MemberTodayCard } from "@/components/today/member-today-card";
import { TrialNotice } from "@/components/profile/trial-notice";
import { requireMember } from "@/lib/auth";
import { Crown } from "@/components/standing/crown";
import { XpRanking } from "@/components/standing/xp-ranking";
import { getMakeupBoard } from "@/lib/makeup";
import { getLatestCrownMove, getStandings } from "@/lib/standing/load";
import { getMaxMembers, isInTrial, listMembers } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { getTimeline } from "@/lib/timeline";
import { getTodayBoard } from "@/lib/today";
import { TIPS } from "@/lib/tips";
import { getTodos } from "@/lib/todo";

// Home (F10): what's waiting on you, everyone's day (with 「軽すぎる」 / 「怪しい」 links), this
// week's penalties and the group timeline. Each section streams in on its own.
export default function HomePage() {
  return (
    <div data-wide className="grid gap-6 lg:grid-cols-2 lg:gap-x-10">
      <header className="flex items-center justify-between gap-3 lg:col-span-2">
        {/* The viewer's rank restyles the title (rank-themes.css: .brand-title, .brand-sparkles). */}
        <div className="relative">
          <span aria-hidden className="brand-sparkles">
            {SPARKLES.map(([left, top, size, delay]) => (
              <span key={`${left},${top}`} style={{ left, top, width: size, height: size, animationDelay: `${delay}s` }} />
            ))}
          </span>
          <h1 className="brand-title relative m-0 font-en text-[clamp(1.4rem,7vw,1.8rem)] leading-none whitespace-nowrap [text-shadow:3px_3px_0_#fff,5px_5px_0_var(--ink)]">
            <span>COMMIT </span>
            <span className="brand-or-treat">OR TREAT</span>
          </h1>
        </div>
        <Suspense fallback={<span className="size-11 rounded-full border-[3px] border-ink bg-card" />}>
          <MyAvatarLink />
        </Suspense>
      </header>

      <div className="empty:hidden lg:col-span-2">
        <Suspense fallback={null}>
          <Trial />
        </Suspense>
      </div>

      {/* PC: what to do on the left, the group's week on the right. On a phone the columns
          dissolve (contents) and the sections stack in the original order. */}
      <div className="contents lg:grid lg:content-start lg:gap-6">
        <section data-tip="home_todo" className="grid gap-2.5">
          <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">あなたがやること</h2>
          <Suspense fallback={<PageLoading />}>
            <Todos />
          </Suspense>
        </section>

        <Suspense fallback={<PageLoading />}>
          <Missions />
        </Suspense>

        <div className="order-last empty:hidden lg:order-none">
          <Suspense fallback={null}>
            <Invite />
          </Suspense>
        </div>
      </div>

      <div className="contents lg:grid lg:content-start lg:gap-6">
        <Suspense fallback={null}>
          <Ranking />
        </Suspense>

        <Suspense fallback={null}>
          <Ranks />
        </Suspense>

        <section className="grid gap-3">
          <h2 className="m-0 font-en text-[1.4rem] leading-none">TIMELINE</h2>
          <Suspense fallback={<PageLoading />}>
            <GroupTimeline />
          </Suspense>
        </section>
      </div>

      <Suspense fallback={null}>
        <HomeTip />
      </Suspense>
    </div>
  );
}

/** Glints around the gold title: left, top, size (px) and delay (s). */
const SPARKLES = [
  [-20, 18, 14, 0],
  [96, -16, 11, 0.9],
  [200, -10, 9, 1.7],
  [270, 30, 10, 2],
  [292, -14, 22, 0.6],
  [314, 14, 13, 1.3],
] as const;

/** Coach marks (F15): what to do first, then the 「軽すぎる？」 link once someone else has one. */
async function HomeTip() {
  const board = await getTodayBoard();
  return (
    <PageTip
      candidates={[
        ["home_todo", TIPS.home_todo],
        board.members.some((member) => member.canFlag) && ["peer_buttons", TIPS.peer_buttons],
      ]}
    />
  );
}

async function MyAvatarLink() {
  const me = await requireMember();
  const [members, standings] = await Promise.all([listMembers(), getStandings()]);
  return (
    <Link href="/settings" aria-label="プロフィールと設定" className="th-me relative shrink-0">
      <Avatar
        name={me.display_name}
        src={me.avatar_url}
        colorIndex={Math.max(0, members.findIndex((member) => member.id === me.id))}
      />
      {standings.get(me.id)?.crown ? <Crown className="pointer-events-none absolute -top-3.5 -left-3 w-8 -rotate-[18deg]" /> : null}
    </Link>
  );
}

async function Trial() {
  const me = await requireMember();
  return isInTrial(me.trial_ends_at) ? <TrialNotice trialEndsAt={me.trial_ends_at} /> : null;
}

async function Todos() {
  return <TodoList todos={await getTodos()} />;
}

async function Missions() {
  const [board, maxMembers, makeup, standings] = await Promise.all([
    getTodayBoard(),
    getMaxMembers(),
    getMakeupBoard(),
    getStandings(),
  ]);
  const viewerRank = standings.get(board.me.id)?.rank.id;
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 font-en text-[1.4rem] leading-none">TODAY&apos;S MISSIONS</h2>
        <span className="font-en text-base">
          {board.members.length} / {maxMembers}
        </span>
      </div>
      {board.members.map((member) => (
        <MemberTodayCard
          key={member.id}
          member={member}
          makeup={makeup.enabled ? makeup.remainingByMember.get(member.id) : undefined}
          standing={standings.get(member.id)}
          viewerRank={viewerRank}
        />
      ))}
    </section>
  );
}

async function Ranking() {
  const me = await requireMember();
  const supabase = await createClient();
  const [{ data, error }, standings] = await Promise.all([
    supabase
      .from("penalty_summary")
      .select("user_id, display_name, this_week_points, this_week_trial_points, total_points, open_settlement_id"),
    getStandings(),
  ]);
  if (error) throw error;
  const rows: RankingRow[] = data.map((row) => ({
    userId: row.user_id!,
    name: row.display_name!,
    thisWeek: row.this_week_points ?? 0,
    thisWeekTrial: row.this_week_trial_points ?? 0,
    total: row.total_points ?? 0,
    owes: row.open_settlement_id !== null,
    // 貧乏人 (F13): only past the deadline (P7), not every open settlement.
    broke: standings.get(row.user_id!)?.titles.some((title) => title.id === "binbounin") ?? false,
  }));
  return <RankingReceipt rows={rows} iOwe={rows.some((row) => row.userId === me.id && row.owes)} />;
}

async function Ranks() {
  const [members, standings] = await Promise.all([listMembers(), getStandings()]);
  // The crown's latest move this week, if it went to whoever holds it now: confetti once per viewer.
  const holder = [...standings.values()].find((standing) => standing.crown)?.memberId;
  const moved = holder ? await getLatestCrownMove() : null;
  const crownMoved =
    moved && moved.actor_id === holder ? { eventId: moved.id, name: members.find((member) => member.id === holder)?.display_name ?? "" } : null;
  return (
    <XpRanking
      crownMoved={crownMoved}
      rows={members.flatMap((member, index) => {
        const standing = standings.get(member.id);
        return standing ? [{ id: member.id, name: member.display_name, avatarUrl: member.avatar_url, colorIndex: index, standing }] : [];
      })}
    />
  );
}

/** The latest few; the rest is on /timeline. */
async function GroupTimeline() {
  const { items, next } = await getTimeline({ limit: 5 });
  return (
    <>
      <Timeline items={items} />
      {next ? (
        <Link href="/timeline" className="text-sm font-bold underline underline-offset-2">
          もっと見る →
        </Link>
      ) : null}
    </>
  );
}

async function Invite() {
  const [members, maxMembers] = await Promise.all([listMembers(), getMaxMembers()]);
  return members.length < maxMembers ? <InvitePanel /> : null;
}
