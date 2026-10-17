"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Unread count on the 通知 tab. Counts through RLS (only the member's own rows) and refreshes on
 * any change to their notifications via Realtime, so a new one shows up without reloading.
 */
export function UnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function load() {
      const { count: unread, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (active && !error) setCount(unread ?? 0);
    }

    load();
    const channel = supabase
      .channel("unread-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => load())
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  if (count === 0) return null;
  return (
    <span
      aria-label={`未読 ${count} 件`}
      className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full border-2 border-ink bg-red px-1 text-[0.65rem] leading-4 font-black text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
