import { Suspense } from "react";
import { AppShell } from "@/components/app/app-shell";
import { PageLoading } from "@/components/app/page-loading";
import { requireMember } from "@/lib/auth";

// Members-only screens. The shell (bottom navigation) is static; the membership check reads the
// session, so it streams in behind Suspense and sends non-members to /join before any page renders.
// Pages put their own data behind a Suspense too: on navigation between pages this layout stays
// mounted, so its boundary doesn't cover them.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<PageLoading />}>
        <RequireMember>{children}</RequireMember>
      </Suspense>
    </AppShell>
  );
}

async function RequireMember({ children }: { children: React.ReactNode }) {
  await requireMember();
  return children;
}
