import "server-only";
import { z } from "zod";

const supabaseSecretSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

const inviteSchema = z.object({
  INVITE_CODE: z.string().min(4),
});

const cronSchema = z.object({
  CRON_SECRET: z.string().min(32),
});

const geminiSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1),
});

const pushSchema = z.object({
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().startsWith("mailto:"),
});

// Parsed lazily per feature so a missing key (Gemini, cron, ...) only breaks the feature that uses it.
function lazy<T extends z.ZodType>(schema: T) {
  let value: z.infer<T> | undefined;
  return () => (value ??= schema.parse(process.env));
}

export const supabaseSecretEnv = lazy(supabaseSecretSchema);
export const inviteEnv = lazy(inviteSchema);
export const cronEnv = lazy(cronSchema);
export const geminiEnv = lazy(geminiSchema);
export const pushEnv = lazy(pushSchema);
