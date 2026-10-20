"use client";

import { Suspense } from "react";
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

type Props = { basePath?: string; live?: boolean };

/**
 * `live` shows the unread badge (off in the /preview gallery, which has no session).
 * The current path is request data on dynamic routes (/logs/[id]), so the highlighted tab
 * streams in behind Suspense; until then the menu shows without a highlight.
 */
export function BottomNav(props: Props) {
  return (
    <Suspense fallback={<Nav {...props} pathname={null} />}>
      <CurrentNav {...props} />
    </Suspense>
  );
}

function CurrentNav(props: Props) {
  return <Nav {...props} pathname={usePathname()} />;
}

function Nav({ basePath = "", live = false, pathname }: Props & { pathname: string | null }) {
  return (
    <nav
      aria-label="メインメニュー"
      className="th-nav fixed inset-x-0 bottom-0 z-20 border-t-[3px] border-ink bg-paper pb-[env(safe-area-inset-bottom,0px)]"
    >
      <ul className="mx-auto flex max-w-[440px] list-none md:max-w-[720px] justify-around p-0 py-2">
        {TABS.map((tab) => {
          const href = `${basePath}${tab.href === "/" ? "" : tab.href}` || "/";
          const active = pathname === href;
          return (
            <li key={tab.href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "th-nav-link relative block rounded-full px-3 py-1.5 text-xs font-bold md:px-4 md:py-2 md:text-sm",
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
