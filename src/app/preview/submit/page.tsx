import { SubmitForm } from "@/components/submit/submit-form";

export default function PreviewSubmitPage() {
  return (
    <div className="grid gap-5">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">振り返り提出</h1>
      <SubmitForm goal="線形代数 3 章の演習 10 問" passphrase="さくら 47" attemptsLeft={3} />
    </div>
  );
}
