import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabasePublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/** Per-request client acting as the signed-in user (RLS applies). */
export async function createClient() {
  // Session checks compare token expiry with the current time, so they can never be prerendered
  // (Cache Components flags the Date.now() inside supabase-js otherwise).
  await connection();
  const cookieStore = await cookies();
  const { url, publishableKey } = supabasePublicEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components can't set cookies; src/proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
