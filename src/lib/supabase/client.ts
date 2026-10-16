import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicEnv } from "@/lib/env";

/** Browser client: reads through RLS only. All writes go through Server Actions (ADR-004). */
export function createClient() {
  const { url, publishableKey } = supabasePublicEnv();
  return createBrowserClient(url, publishableKey);
}
