import { IntroCards } from "@/components/onboarding/intro-cards";
import { buildIntro } from "@/lib/intro";

// The intro lecture (F15) with the default settings, a member still in the trial, before 12:00.
const SAMPLE = buildIntro(
  {
    declaration_cutoff: "12:00:00",
    last_declaration_reminder: "11:00:00",
    penalty_no_declaration: 500,
    penalty_slacked: 700,
    passing_score: 70,
    max_attempts: 3,
    flag_window_hours: 3,
    dispute_window_hours: 24,
    settlement_weekday: 6,
    settlement_time: "23:59:00",
    rest_days_per_week: 1,
    slack_streak_threshold: 3,
    makeup_per_streak: 1,
  },
  "2026-10-25T00:00:00+09:00",
  new Date("2026-10-19T09:30:00+09:00"),
);

export default function PreviewIntroPage() {
  return (
    <main className="mx-auto grid w-full max-w-[440px] px-4 py-6">
      <IntroCards data={SAMPLE} preview />
    </main>
  );
}
