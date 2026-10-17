import { ReasonForm } from "@/components/report/reason-form";

export default function PreviewReportPage() {
  return (
    <ReasonForm
      deadline="2026-10-16T23:00:00+09:00"
      goal="線形代数 3 章の演習 10 問"
      minChars={30}
      unrealisticStreak={1}
    />
  );
}
