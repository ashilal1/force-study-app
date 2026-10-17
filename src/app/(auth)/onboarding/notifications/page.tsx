import type { Metadata } from "next";
import { Suspense } from "react";
import { NotificationSetup } from "@/components/notifications/notification-setup";
import { requireMember } from "@/lib/auth";
import { vapidPublicKey } from "@/lib/env";

export const metadata: Metadata = { title: "通知の設定 | Commit or Treat" };

// The notification gate (F0). Outside the (app) group so the gate itself doesn't redirect here
// in a loop; members land here until this device has confirmed a test notification.
export default function NotificationOnboardingPage() {
  return (
    <Suspense fallback={<p className="m-0 text-center text-sm text-sub">読み込み中…</p>}>
      <Setup />
    </Suspense>
  );
}

async function Setup() {
  await requireMember();
  return <NotificationSetup vapidPublicKey={vapidPublicKey()} />;
}
