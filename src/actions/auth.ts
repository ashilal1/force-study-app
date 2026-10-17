"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AFTER_LOGIN_COOKIE, AFTER_LOGIN_MAX_AGE, safeNextPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/** Starts Google OAuth (PKCE). The code verifier goes into a cookie; /auth/callback finishes it. */
export async function signInWithGoogle(formData: FormData) {
  // Server Actions always carry Origin (Next.js checks it against Host), so it is our own origin.
  const origin = (await headers()).get("origin");
  if (!origin) redirect("/login?error=origin");

  const cookieStore = await cookies();
  const next = safeNextPath(formData.get("next"));
  if (next) {
    cookieStore.set(AFTER_LOGIN_COOKIE, next, {
      httpOnly: true,
      secure: origin.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: AFTER_LOGIN_MAX_AGE,
    });
  } else {
    cookieStore.delete(AFTER_LOGIN_COOKIE);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
