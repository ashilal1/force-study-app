import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { PageLoading } from "@/components/app/page-loading";
import { NotificationGuard } from "@/components/notifications/notification-guard";
import { ViewerTheme } from "@/components/standing/viewer-theme";
import { hasConfirmedNotifications, requireMember } from "@/lib/auth";

// Members-only screens. The shell (bottom navigation) is static; the membership check reads the
// session, so it streams in behind Suspense and sends non-members to /join before any page renders.
// Members who haven't confirmed notifications (F0) go to the setup screen first; NotificationGuard
// re-checks this particular device on every open.
// Pages put their own data behind a Suspense too: on navigation between pages this layout stays
// mounted, so its boundary doesn't cover them.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell live>
      <Suspense fallback={<PageLoading />}>
        <RequireMember>{children}</RequireMember>
      </Suspense>
    </AppShell>
  );
}

async function RequireMember({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  if (!(await hasConfirmedNotifications(member))) redirect("/onboarding/notifications");
  return (
    <>
      <NotificationGuard />
      {children}
      {/* The viewer's rank restyles the screen (F14); it streams in after the page. */}
      <Suspense fallback={null}>
        <ViewerTheme />
      </Suspense>
    </>
  );
}
