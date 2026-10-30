import { StudyPhotos } from "@/components/submit/study-photos";
import { SubmitForm } from "@/components/submit/submit-form";

// The start photo prompt, a day with photos taken (the next one still waiting), and the form.
const TAKEN = [
  { id: "a", kind: "start", url: "/icons/icon-512.png", takenAt: "2026-10-20T01:05:00Z" },
  { id: "b", kind: "progress", url: null, takenAt: "2026-10-20T01:40:00Z" },
];

export default function PreviewSubmitPage() {
  return (
    <div className="grid gap-5">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">振り返り提出</h1>
      <StudyPhotos photos={[]} gapMinutes={25} required open />
      <StudyPhotos photos={TAKEN} gapMinutes={60 * 24 * 365 * 10} required={false} open />
      <SubmitForm goal="線形代数 3 章の演習 10 問" passphrase="さくら 47" attemptsLeft={3} />
    </div>
  );
}
