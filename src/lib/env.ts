import { z } from "zod";

// NEXT_PUBLIC_* must be referenced literally so Next.js can inline them in client bundles.
const supabasePublicSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
});

let supabasePublic: z.infer<typeof supabasePublicSchema> | undefined;

/** VAPID public key for PushManager.subscribe (Web Push). Null when push isn't configured. */
export function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

export function supabasePublicEnv() {
  supabasePublic ??= supabasePublicSchema.parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return supabasePublic;
}
