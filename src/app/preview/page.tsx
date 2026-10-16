import { Dashboard } from "@/components/dashboard/dashboard";
import { sampleDashboard } from "@/lib/sample/dashboard";

export default function PreviewDashboardPage() {
  return <Dashboard data={sampleDashboard} />;
}
