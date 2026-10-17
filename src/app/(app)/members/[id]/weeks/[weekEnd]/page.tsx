import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLoading } from "@/components/app/page-loading";
import { Karte } from "@/components/brand/karte";
import { Sticker } from "@/components/brand/sticker";
import { AchievementCalendar } from "@/components/review/achievement-calendar";
import { PenaltyChart } from "@/components/review/charts";
import { StatCards } from "@/components/review/stat-cards";
import { WeeklyNoteForm } from "@/components/review/weekly-note-form";
import { requireMember } from "@/lib/auth";
import { getMemberHistory } from "@/lib/history";
import { summarize } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatJstDay } from "@/lib/time";

export const metadata: Metadata = { title: "週の振り返り | Commit or Treat" };

export default function WeekPage({ params }: PageProps<"/members/[id]/weeks/[weekEnd]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Week params={params} />
    </Suspense>
  );
}

async function Week({ params }: Pick<PageProps<"/members/[id]/weeks/[weekEnd]">, "params">) {
  const { id, weekEnd } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd)) notFound();
  const me = await requireMember();
  const supabase = await createClient();
  const [{ data: review, error }, history] = await Promise.all([
    supabase.from("weekly_reviews").select("ai_summary, self_note, self_note_updated_at").eq("user_id", id).eq("week_end", weekEnd).maybeSingle(),
    getMemberHistory(id, "all"),
  ]);
  if (error) throw error;
  if (!review || !history) notFound();

  const weekStart = addDays(weekEnd, -6);
  const days = history.allDays.filter((day) => day.date >= weekStart && day.date <= weekEnd);
  const summary = summarize(days, history.allDays.filter((day) => day.date <= weekEnd));
  const isMe = me.id === id;

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <Link href={`/members/${id}`} className="text-xs font-bold underline underline-offset-2">
          ← {history.member.name} さんの振り返り
        </Link>
        <h1 className="m-0 font-heading text-[1.4rem] leading-tight font-normal">
          {formatJstDay(weekStart)}〜{formatJstDay(weekEnd)} の振り返り
        </h1>
      </header>

      <StatCards summary={summary} label="この週" />
      <AchievementCalendar days={days} />

      <Karte title="AI のまとめ">
        {review.ai_summary ? (
          <p className="m-0 text-sm leading-relaxed font-medium whitespace-pre-wrap">{review.ai_summary}</p>
        ) : (
          <p className="m-0 text-center text-sm text-sub">まとめを作っています（数分でできます）</p>
        )}
      </Karte>

      <section className="grid gap-2.5">
        <h2 className="m-0 font-heading text-[1.15rem] leading-tight font-normal">ペナルティ</h2>
        <PenaltyChart rows={history.penalties.filter((row) => row.weekEnd === weekEnd)} />
      </section>

      <section className="grid gap-2.5">
        <h2 className="m-0 font-heading text-[1.15rem] leading-tight font-normal">振り返りメモ</h2>
        {isMe ? (
          <WeeklyNoteForm weekEnd={weekEnd} note={review.self_note} />
        ) : (
          <Sticker shadow="sm" className="px-3.5 py-3 text-sm whitespace-pre-wrap">
            {review.self_note ?? "まだメモはありません"}
          </Sticker>
        )}
      </section>
    </div>
  );
}
