import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import Link from "next/link";
import { signInWithGoogle } from "@/actions/auth";
import { OpenInBrowser } from "@/components/auth/open-in-browser";
import { ActionButton } from "@/components/brand/action-button";
import { Sticker } from "@/components/brand/sticker";
import { Tape } from "@/components/brand/tape";
import { SubmitButton } from "@/components/form/submit-button";
import { detectInAppBrowser } from "@/lib/in-app-browser";
import { safeNextPath } from "@/lib/redirect";

export const metadata: Metadata = { title: "ログイン | Commit or Treat" };

const ERRORS: Record<string, string> = {
  callback: "ログインできませんでした。もう一度試してください",
  oauth: "Google ログインを始められませんでした。もう一度試してください",
  origin: "ログインできませんでした。ページを開き直してください",
};

type SearchParams = PageProps<"/login">["searchParams"];

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
      <Suspense
        fallback={
          <ActionButton type="button" tone="mint" disabled>
            Google でログイン
          </ActionButton>
        }
      >
        <SignIn searchParams={searchParams} />
      </Suspense>
      <p className="m-0 text-center text-xs text-sub">
        はじめての人は、ログインのあとにメンバーからもらった招待コードを入れます。
      </p>
      <Link href="/guide" className="text-center text-sm font-bold underline underline-offset-2">
        はじめての人へ（使い方） →
      </Link>
    </Sticker>
  );
}

async function LoginError({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  if (!message) return null;
  return (
    <p role="alert" className="m-0 rounded-[10px] border-[2.5px] border-red bg-white px-3 py-2 text-sm font-bold text-red">
      {message}
    </p>
  );
}

/**
 * The Google button, carrying ?next= (set by the proxy, e.g. an invite link) into the sign-in
 * action. Inside LINE and other in-app browsers Google refuses to sign in, so those get directions
 * to Safari / Chrome instead (F15).
 */
async function SignIn({ searchParams }: { searchParams: SearchParams }) {
  const inApp = detectInAppBrowser((await headers()).get("user-agent"));
  if (inApp) return <OpenInBrowser app={inApp.app} android={inApp.android} />;
  const next = safeNextPath((await searchParams).next);
  return (
    <div className="grid gap-2">
      <form action={signInWithGoogle}>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <SubmitButton tone="mint" pendingLabel="Google に移動中…">
          Google でログイン
        </SubmitButton>
      </form>
      <p className="m-0 text-center text-xs text-sub">
        LINE などのアプリから開いてログインできないときは、Safari か Chrome で開き直してください。
      </p>
    </div>
  );
}
