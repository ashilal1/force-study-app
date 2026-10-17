import { NextResponse, type NextRequest } from "next/server";
import { AFTER_LOGIN_COOKIE, safeNextPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Google sends the user back here with ?code=. Exchanging it (with the PKCE verifier cookie set
 * by signInWithGoogle) writes the session cookies. Then we go back to where they were headed
 * (e.g. an invite link), or home; non-members are sent on to /join by the app layout.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(request.cookies.get(AFTER_LOGIN_COOKIE)?.value) ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL(next, origin));
      response.cookies.delete(AFTER_LOGIN_COOKIE);
      return response;
    }
    console.error("OAuth code exchange failed", error);
  }

  // Missing code: the user cancelled on Google's screen, or the provider returned an error.
  const retry = new URL("/login", origin);
  retry.searchParams.set("error", "callback");
  if (next !== "/") retry.searchParams.set("next", next);
  return NextResponse.redirect(retry);
}
