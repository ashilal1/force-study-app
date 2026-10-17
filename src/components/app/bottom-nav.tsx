"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UnreadBadge } from "@/components/notifications/unread-badge";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "ホーム" },
  { href: "/declare", label: "宣言" },
  { href: "/review", label: "振り返り" },
  { href: "/settlements", label: "精算" },
  { href: "/notifications", label: "通知" },
] as const;

/** `live` shows the unread badge (off in the /preview gallery, which has no session). */
export function BottomNav({ basePath = "", live = false }: { basePath?: string; live?: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-20 border-t-[3px] border-ink bg-paper pb-[env(safe-area-inset-bottom,0px)]"
    >
      <ul className="mx-auto flex max-w-[440px] list-none justify-around p-0 py-2">
        {TABS.map((tab) => {
          const href = `${basePath}${tab.href === "/" ? "" : tab.href}` || "/";
          const active = pathname === href;
          return (
            <li key={tab.href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block rounded-full px-3 py-1.5 text-xs font-bold",
                  active ? "bg-ink text-white" : "text-ink",
                )}
              >
                {tab.label}
                {live && tab.href === "/notifications" ? <UnreadBadge /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
