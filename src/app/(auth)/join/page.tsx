import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";
import { Sticker } from "@/components/brand/sticker";
import { JoinForm } from "@/components/auth/join-form";
import { getMember, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "グループに参加 | Commit or Treat" };

export default function JoinPage() {
  return (
    <Sticker className="grid gap-5 px-5 py-6">
      <div className="grid gap-1">
        <h2 className="m-0 font-heading text-[1.4rem] leading-tight font-normal">グループに参加</h2>
        <p className="m-0 text-sm leading-relaxed font-medium">
          メンバーから聞いた招待コードを入れてください。表示名とアイコンはあとから変えられます。
        </p>
      </div>
      <Suspense fallback={<p className="m-0 text-sm text-sub">読み込み中…</p>}>
        <Join />
      </Suspense>
    </Sticker>
  );
}

async function Join() {
  const user = await requireUser();
  if (await getMember()) redirect("/");

  return (
    <>
      <JoinForm defaultName={user.googleName ?? ""} googleAvatarUrl={user.googleAvatarUrl} />
      <form action={signOut} className="grid justify-items-center gap-1 text-xs text-sub">
        <span>{user.email ?? "Google アカウント"} でログイン中</span>
        <button type="submit" className="font-bold text-ink underline underline-offset-2">
          別のアカウントにする
        </button>
      </form>
    </>
  );
}
