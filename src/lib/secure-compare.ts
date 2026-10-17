import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compares a submitted secret (invite code, cron secret) without leaking how much of it matched.
 * Both sides are hashed first so inputs of different lengths still take the same time.
 */
export function secureEqual(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
