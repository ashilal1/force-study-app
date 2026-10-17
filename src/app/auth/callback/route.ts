import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Google sends the user back here with ?code=. Exchanging it (with the PKCE verifier cookie set
 * by signInWithGoogle) writes the session cookies. Members then land on the dashboard; everyone
 * else is sent on to /join by the app layout.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", origin));
    console.error("OAuth code exchange failed", error);
  }

  // Missing code: the user cancelled on Google's screen, or the provider returned an error.
  return NextResponse.redirect(new URL("/login?error=callback", origin));
}
