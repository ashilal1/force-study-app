import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { IntroCards } from "@/components/onboarding/intro-cards";
import { requireMember } from "@/lib/auth";
import { buildIntro, INTRO_SETTINGS } from "@/lib/intro";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "はじめに | Commit or Treat" };

// The intro lecture (F15): right after joining, before the notification setup (F0). Outside the
// (app) group so the gate doesn't redirect here in a loop. ?again=1 is 「使い方をもう一度見る」.
export default function IntroPage({ searchParams }: PageProps<"/onboarding/intro">) {
  return (
    <Suspense fallback={<p className="m-0 text-center text-sm text-sub">読み込み中…</p>}>
      <Intro searchParams={searchParams} />
    </Suspense>
  );
}

async function Intro({ searchParams }: Pick<PageProps<"/onboarding/intro">, "searchParams">) {
  const member = await requireMember();
  const again = (await searchParams).again === "1";
  if (member.rules_accepted_at && !again) redirect("/");

  const supabase = await createClient();
  const { data: settings, error } = await supabase.from("group_settings").select(INTRO_SETTINGS).single();
  if (error) throw error;
  return <IntroCards data={buildIntro(settings, member.trial_ends_at)} again={again} />;
}
