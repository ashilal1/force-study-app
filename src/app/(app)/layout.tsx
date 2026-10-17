import { Suspense } from "react";
import { AppShell } from "@/components/app/app-shell";
import { requireMember } from "@/lib/auth";

// Members-only screens. The shell (bottom navigation) is static; the membership check reads the
// session, so it streams in behind Suspense and sends non-members to /join before any page renders.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<p className="m-0 py-10 text-center text-sm text-sub">読み込み中…</p>}>
        <RequireMember>{children}</RequireMember>
      </Suspense>
    </AppShell>
  );
}

async function RequireMember({ children }: { children: React.ReactNode }) {
  await requireMember();
  return children;
}
