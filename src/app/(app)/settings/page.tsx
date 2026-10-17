import type { Metadata } from "next";
import { Suspense } from "react";
import { signOut } from "@/actions/auth";
import { PageLoading } from "@/components/app/page-loading";
import { ActionButton } from "@/components/brand/action-button";
import { Sticker } from "@/components/brand/sticker";
import { ProfileForm } from "@/components/profile/profile-form";
import { TrialNotice } from "@/components/profile/trial-notice";
import { getSessionUser, requireMember } from "@/lib/auth";
import { isInTrial } from "@/lib/members";

export const metadata: Metadata = { title: "設定 | Commit or Treat" };

export default function SettingsPage() {
  return (
    <div className="grid gap-5">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">プロフィール</h1>
      <Suspense fallback={<PageLoading />}>
        <Profile />
      </Suspense>
      <form action={signOut}>
        <ActionButton type="submit" tone="white">
          ログアウト
        </ActionButton>
      </form>
    </div>
  );
}

async function Profile() {
  const me = await requireMember();
  const user = await getSessionUser();

  return (
    <>
      {isInTrial(me.trial_ends_at) ? <TrialNotice trialEndsAt={me.trial_ends_at} /> : null}
      <Sticker className="px-4 py-5">
        <ProfileForm
          displayName={me.display_name}
          paypayLink={me.paypay_link}
          usesGooglePhoto={Boolean(me.avatar_url)}
          googleAvatarUrl={user?.googleAvatarUrl ?? null}
        />
      </Sticker>
    </>
  );
}
