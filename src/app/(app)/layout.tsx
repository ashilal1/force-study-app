import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { PageLoading } from "@/components/app/page-loading";
import { NotificationGuard } from "@/components/notifications/notification-guard";
import { ViewerTheme } from "@/components/standing/viewer-theme";
import { hasConfirmedNotifications, requireMember } from "@/lib/auth";

// Members-only screens. The shell (bottom navigation) is static; the membership check reads the
// session, so it streams in behind Suspense and sends non-members to /join before any page renders.
// New members watch the intro lecture and agree to the rules first (F15), then confirm notifications
// (F0) on the setup screen; NotificationGuard
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
  if (!member.rules_accepted_at) redirect("/onboarding/intro");
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
