// Where to go after signing in, e.g. an invite link opened while signed out (/join?code=...).
// Carried through Google in a short-lived cookie rather than the OAuth redirect URL, so the
// Supabase redirect allowlist only needs the bare /auth/callback.

export const AFTER_LOGIN_COOKIE = "after_login";
export const AFTER_LOGIN_MAX_AGE = 10 * 60;

/** Accepts only same-site paths ("/join?code=X"); anything else (other hosts, "//x", "/\x") is null. */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost") return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
