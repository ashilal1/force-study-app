import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "@/lib/env";
import { supabaseSecretEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Secret-key client (bypasses RLS). Only Server Actions and Route Handlers may use it,
 * and only after checking who the caller is. State changes go through RPCs.
 */
export function createAdminClient() {
  return createClient<Database>(supabasePublicEnv().url, supabaseSecretEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
