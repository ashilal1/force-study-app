import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PageLoading } from "@/components/app/page-loading";
import { Timeline } from "@/components/dashboard/timeline";
import { getTimeline } from "@/lib/timeline";

export const metadata: Metadata = { title: "タイムライン | Commit or Treat" };

// The whole group timeline, 30 at a time, newest first (the home shows the latest 5).
export default function TimelinePage({ searchParams }: PageProps<"/timeline">) {
  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="m-0 font-en text-[1.6rem] leading-none">TIMELINE</h1>
        <Link href="/" className="text-sm font-bold underline underline-offset-2">
          ← ホーム
        </Link>
      </div>
      <Suspense fallback={<PageLoading />}>
        <Page searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Page({ searchParams }: Pick<PageProps<"/timeline">, "searchParams">) {
  const { before } = await searchParams;
  const cursor = typeof before === "string" && !Number.isNaN(Date.parse(before)) ? before : undefined;
  const { items, next } = await getTimeline({ limit: 30, before: cursor });
  return (
    <>
      <Timeline items={items} />
      {next ? (
        <Link href={`/timeline?${new URLSearchParams({ before: next })}`} className="text-sm font-bold underline underline-offset-2">
          もっと前を見る →
        </Link>
      ) : null}
    </>
  );
}
