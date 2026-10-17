import type { Metadata } from "next";
import { Suspense } from "react";
import { signInWithGoogle } from "@/actions/auth";
import { Sticker } from "@/components/brand/sticker";
import { Tape } from "@/components/brand/tape";
import { SubmitButton } from "@/components/form/submit-button";

export const metadata: Metadata = { title: "ログイン | Commit or Treat" };

const ERRORS: Record<string, string> = {
  callback: "ログインできませんでした。もう一度試してください",
  oauth: "Google ログインを始められませんでした。もう一度試してください",
  origin: "ログインできませんでした。ページを開き直してください",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Sticker className="relative grid gap-5 px-5 pt-7 pb-6">
      <Tape className="-top-3 left-1/2 -translate-x-1/2" />
      <p className="m-0 text-center text-sm leading-relaxed font-medium">
        宣言して、提出して、AI に判定してもらう。
        <br />
        できなかったら、理由を書いて払う。
      </p>
      <Suspense>
        <LoginError searchParams={searchParams} />
      </Suspense>
      <form action={signInWithGoogle}>
        <SubmitButton tone="mint" pendingLabel="Google に移動中…">
          Google でログイン
        </SubmitButton>
      </form>
      <p className="m-0 text-center text-xs text-sub">はじめての人は、ログインのあとに招待コードを入れます。</p>
    </Sticker>
  );
}

async function LoginError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  if (!message) return null;
  return (
    <p role="alert" className="m-0 rounded-[10px] border-[2.5px] border-red bg-white px-3 py-2 text-sm font-bold text-red">
      {message}
    </p>
  );
}
