import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/actions/auth";
import { PageLoading } from "@/components/app/page-loading";
import { ActionButton } from "@/components/brand/action-button";
import { Sticker } from "@/components/brand/sticker";
import { NotificationHelp } from "@/components/notifications/notification-help";
import { ProfileForm } from "@/components/profile/profile-form";
import { GroupAdmin } from "@/components/settings/group-admin";
import { GroupSettingsForm } from "@/components/settings/group-settings-form";
import { LeaveGroup } from "@/components/settings/leave-group";
import { TrialNotice } from "@/components/profile/trial-notice";
import { getSessionUser, requireMember } from "@/lib/auth";
import { isInTrial, listMembers } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "設定 | Commit or Treat" };

export default function SettingsPage() {
  return (
    <div className="grid gap-5">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">プロフィール</h1>
      <Suspense fallback={<PageLoading />}>
        <Profile />
      </Suspense>
      <section className="grid gap-2.5">
        <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">通知</h2>
        <p className="m-0 text-sm font-medium text-sub">
          バナーが出ない・音が鳴らないときは、使っている端末の手順を確かめてください。
        </p>
        <NotificationHelp />
        <Link
          href="/onboarding/notifications"
          className="text-center text-sm font-bold underline underline-offset-2"
        >
          この端末の通知を設定し直す
        </Link>
      </section>
      <div className="grid gap-1.5">
        <Link href="/onboarding/intro?again=1" className="text-sm font-bold underline underline-offset-2">
          使い方をもう一度見る →
        </Link>
        <Link href="/guide" className="text-sm font-bold underline underline-offset-2">
          使い方・写真と記録の扱い（くわしく） →
        </Link>
      </div>
      <section className="grid gap-2">
        <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">記録の書き出し</h2>
        <p className="m-0 text-sm font-medium text-sub">自分の記録をすべてダウンロードできます。</p>
        <div className="flex gap-3 text-sm font-bold">
          <a href="/api/export?format=csv" className="underline underline-offset-2">
            CSV（表計算ソフト用）
          </a>
          <a href="/api/export?format=json" className="underline underline-offset-2">
            JSON（すべての記録）
          </a>
        </div>
      </section>
      <Suspense fallback={null}>
        <AdminSettings />
      </Suspense>
      <form action={signOut}>
        <ActionButton type="submit" tone="white">
          ログアウト
        </ActionButton>
      </form>
      <Suspense fallback={null}>
        <Leave />
      </Suspense>
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

async function AdminSettings() {
  const me = await requireMember();
  const supabase = await createClient();
  const { data: group, error: groupError } = await supabase.from("groups").select("name").single();
  if (groupError) throw groupError;
  if (!me.is_admin) {
    return <p className="m-0 text-sm font-medium text-sub">グループ: {group.name}</p>;
  }
  const [{ data, error }, members] = await Promise.all([supabase.from("group_settings").select("*").single(), listMembers()]);
  if (error) throw error;
  return (
    <>
      <section className="grid gap-2.5">
        <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">グループ（管理者）</h2>
        <Sticker className="px-4 py-5">
          <GroupAdmin
            groupName={group.name}
            members={members.map((member, index) => ({
              id: member.id,
              name: member.display_name,
              avatarUrl: member.avatar_url,
              colorIndex: index,
              isAdmin: member.is_admin,
              isMe: member.id === me.id,
            }))}
          />
        </Sticker>
      </section>
      <details className="group">
        <summary className="cursor-pointer list-none font-heading text-[1.2rem] leading-tight font-normal [&::-webkit-details-marker]:hidden">
          グループ設定（管理者）<span className="ml-1 text-sm group-open:hidden">▾</span>
        </summary>
        <p className="m-0 mt-2 text-sm font-medium text-sub">
          ペナルティの額や締切などのルールです。変えると全員に通知されます。その日の途中で時刻を変えると、すでに決まった期限には影響しません。
        </p>
        <Sticker className="mt-3 px-4 py-5">
          <GroupSettingsForm
            current={data as unknown as Record<string, string | number>}
            makeupEnabled={data.makeup_since !== null}
            startPhotoRequired={data.start_photo_required}
          />
        </Sticker>
      </details>
    </>
  );
}


async function Leave() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("groups").select("name").single();
  if (error) throw error;
  return <LeaveGroup groupName={data.name} />;
}
