import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";
import { Sticker } from "@/components/brand/sticker";
import { CreateGroupForm } from "@/components/auth/create-group-form";
import { JoinForm } from "@/components/auth/join-form";
import { getMember, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "グループに参加 | Commit or Treat" };

// Not in a group yet (M10): join one with an invite, or start a new one. One group per person.
export default function JoinPage({ searchParams }: PageProps<"/join">) {
  return (
    <div className="grid gap-5">
      <Sticker className="grid gap-5 px-5 py-6">
        <div className="grid gap-1">
          <h2 className="m-0 font-heading text-[1.4rem] leading-tight font-normal">グループに参加</h2>
          <p className="m-0 text-sm leading-relaxed font-medium">
            メンバーに発行してもらった招待コードを入れてください（発行から少し経つと使えなくなります）。表示名とアイコンはあとから変えられます。
          </p>
        </div>
        <Suspense fallback={<p className="m-0 text-sm text-sub">読み込み中…</p>}>
          <Join searchParams={searchParams} />
        </Suspense>
      </Sticker>
      <Suspense fallback={null}>
        <Create />
      </Suspense>
    </div>
  );
}

async function Create() {
  const user = await requireUser();
  if (await getMember()) return null;
  return (
    <details className="group rounded-[16px] border-[3px] border-ink bg-card px-5 py-4 open:shadow-hard-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between font-heading text-[1.2rem] leading-tight [&::-webkit-details-marker]:hidden">
        新しいグループを作る
        <span aria-hidden className="text-base transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-3 grid gap-4">
        <p className="m-0 text-sm leading-relaxed font-medium text-sub">
          作った人がそのグループの管理者になり、ルールの設定と支払先の入力を受け持ちます。入れるグループは 1 人 1 つだけで、あとから移れません。
        </p>
        <CreateGroupForm defaultName={user.googleName ?? ""} googleAvatarUrl={user.googleAvatarUrl} />
      </div>
    </details>
  );
}

async function Join({ searchParams }: Pick<PageProps<"/join">, "searchParams">) {
  const user = await requireUser();
  if (await getMember()) redirect("/");
  const { code } = await searchParams;

  return (
    <>
      <JoinForm
        defaultCode={typeof code === "string" ? code.slice(0, 32) : ""}
        defaultName={user.googleName ?? ""}
        googleAvatarUrl={user.googleAvatarUrl}
      />
      <form action={signOut} className="grid justify-items-center gap-1 text-xs text-sub">
        <span>{user.email ?? "Google アカウント"} でログイン中</span>
        <button type="submit" className="font-bold text-ink underline underline-offset-2">
          別のアカウントにする
        </button>
      </form>
    </>
  );
}
