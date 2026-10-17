import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PageLoading } from "@/components/app/page-loading";
import { Sticker } from "@/components/brand/sticker";
import { TextInput } from "@/components/form/fields";
import { requireMember } from "@/lib/auth";
import { DAY_KIND, type DayKind } from "@/lib/chart-colors";
import { createClient } from "@/lib/supabase/server";
import { formatJstDay } from "@/lib/time";

export const metadata: Metadata = { title: "検索 | Commit or Treat" };

/** Search declarations and reflections across the group (F12). Uses the trigram indexes. */
export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="grid gap-5">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">検索</h1>
      <Suspense fallback={<PageLoading />}>
        <Search searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type Hit = {
  logId: string;
  userId: string;
  date: string;
  status: string;
  declaration: string | null;
  snippets: { label: string; text: string }[];
};

const KIND: Record<string, DayKind> = {
  completed: "completed",
  passed: "pending",
  pending: "pending",
  missed: "missed",
  no_declaration: "no_declaration",
  invalidated: "invalidated",
};

async function Search({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  await requireMember();
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim().slice(0, 50);

  const form = (
    <form action="/search" className="flex gap-2">
      <TextInput name="q" defaultValue={q} placeholder="例: 線形代数" aria-label="検索する言葉" className="flex-1" />
      <button type="submit" className="rounded-[12px] border-[3px] border-ink bg-tape px-4 font-bold shadow-hard-sm">
        探す
      </button>
    </form>
  );
  if ([...q].length < 2) {
    return (
      <>
        {form}
        <p className="m-0 text-sm text-sub">宣言・学んだこと・できなかったことを 2 文字以上で探せます。</p>
      </>
    );
  }

  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const supabase = await createClient();
  const [profiles, logs, learned, struggled] = await Promise.all([
    supabase.from("profiles").select("id, display_name"),
    supabase.from("study_logs").select("id, user_id, date, status, declaration").ilike("declaration", pattern).order("date", { ascending: false }).limit(50),
    supabase
      .from("submissions")
      .select("learned_text, study_logs!inner(id, user_id, date, status, declaration)")
      .ilike("learned_text", pattern)
      .limit(50),
    supabase
      .from("submissions")
      .select("struggled_text, study_logs!inner(id, user_id, date, status, declaration)")
      .ilike("struggled_text", pattern)
      .limit(50),
  ]);
  for (const result of [profiles, logs, learned, struggled]) if (result.error) throw result.error;

  const hits = new Map<string, Hit>();
  const hitFor = (log: { id: string; user_id: string; date: string; status: string; declaration: string | null }) => {
    const existing = hits.get(log.id);
    if (existing) return existing;
    const hit: Hit = { logId: log.id, userId: log.user_id, date: log.date, status: log.status, declaration: log.declaration, snippets: [] };
    hits.set(log.id, hit);
    return hit;
  };
  for (const log of logs.data!) hitFor(log);
  for (const row of learned.data!) hitFor(row.study_logs).snippets.push({ label: "学んだこと", text: row.learned_text ?? "" });
  for (const row of struggled.data!) hitFor(row.study_logs).snippets.push({ label: "できなかったこと", text: row.struggled_text ?? "" });

  const name = (id: string) => profiles.data!.find((profile) => profile.id === id)?.display_name ?? "メンバー";
  const results = [...hits.values()].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      {form}
      <p className="m-0 text-sm font-bold">「{q}」: {results.length} 日</p>
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {results.map((hit) => (
          <li key={hit.logId}>
            <Link href={`/logs/${hit.logId}`} className="block">
              <Sticker shadow="sm" className="grid gap-1 px-3.5 py-2.5 text-sm">
                <span className="text-xs text-sub">
                  {formatJstDay(hit.date)} ・ {name(hit.userId)} ・ {DAY_KIND[KIND[hit.status] ?? "none"].label}
                </span>
                <Highlighted text={hit.declaration ?? ""} q={q} className="font-bold" />
                {hit.snippets.map((snippet, index) => (
                  <span key={index} className="text-xs">
                    <b>{snippet.label}: </b>
                    <Highlighted text={snippet.text} q={q} />
                  </span>
                ))}
              </Sticker>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Highlighted({ text, q, className }: { text: string; q: string; className?: string }) {
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {text.slice(0, index)}
      <mark className="bg-tape">{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </span>
  );
}
