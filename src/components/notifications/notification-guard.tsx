"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { currentSubscription, detectPlatform, isStandalone, pushSupported } from "@/lib/push-client";

const SETUP = "/onboarding/notifications";

/**
 * Client half of the notification gate (F0). The server already checked that the member has a
 * confirmed device; this checks that *this* device still can receive: permission not revoked,
 * the subscription still there and confirmed, and (iOS) opened from the home screen.
 */
export function NotificationGuard() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<boolean> {
      if (detectPlatform() === "ios" && !isStandalone()) return false;
      if (!pushSupported() || Notification.permission !== "granted") return false;

      const subscription = await currentSubscription();
      if (!subscription) return false;

      // RLS: members read only their own devices.
      const { data, error } = await createClient()
        .from("push_subscriptions")
        .select("verified_at")
        .eq("endpoint", subscription.endpoint)
        .maybeSingle();
      if (error) return true; // A network hiccup shouldn't lock the app; the next open checks again.
      return Boolean(data?.verified_at);
    }

    check()
      .then((ok) => {
        if (!ok && !cancelled) router.replace(SETUP);
      })
      .catch(() => {
        if (!cancelled) router.replace(SETUP);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
