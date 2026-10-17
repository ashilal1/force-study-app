import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PageLoading } from "@/components/app/page-loading";
import { Sticker } from "@/components/brand/sticker";
import { MarkAllRead } from "@/components/notifications/mark-all-read";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatJstDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "通知 | Commit or Treat" };

export default function NotificationsPage() {
  return (
    <div className="grid gap-5">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">通知</h1>
      <Suspense fallback={<PageLoading />}>
        <NotificationList />
      </Suspense>
    </div>
  );
}

async function NotificationList() {
  await requireMember();
  const supabase = await createClient();
  // RLS returns only the member's own notifications.
  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("id, title, body, url, read_at, requires_action, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  if (notifications.length === 0) {
    return <p className="m-0 py-10 text-center text-sm text-sub">まだ通知はありません</p>;
  }

  const hasUnread = notifications.some((notification) => !notification.read_at);
  return (
    <>
      {hasUnread ? <MarkAllRead /> : null}
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {notifications.map((notification) => (
          <li key={notification.id}>
            <Link href={notification.url ?? "/notifications"} className="block">
              <Sticker
                shadow="sm"
                className={cn("grid gap-0.5 px-3.5 py-3", !notification.read_at && "bg-tape")}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <b className="text-sm">{notification.title}</b>
                  <time dateTime={notification.created_at} className="shrink-0 text-xs text-sub">
                    {formatJstDateTime(notification.created_at)}
                  </time>
                </span>
                {notification.body ? <span className="text-sm font-medium">{notification.body}</span> : null}
              </Sticker>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
