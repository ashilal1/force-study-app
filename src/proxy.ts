import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets, the service worker, the manifest, and API routes
    // (/api/cron authenticates with CRON_SECRET; other API routes check the session themselves).
    "/((?!_next/static|_next/image|api/|sw\\.js|manifest\\.webmanifest|icons/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)",
  ],
};
