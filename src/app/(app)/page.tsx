import Link from "next/link";
import { Avatar } from "@/components/brand/avatar";
import { Pill } from "@/components/brand/pill";
import { Sticker } from "@/components/brand/sticker";
import { TrialNotice } from "@/components/profile/trial-notice";
import { requireMember } from "@/lib/auth";
import { isInTrial, listMembers } from "@/lib/members";

// Placeholder home until the real dashboard (M8) has data to show: who's in the group and the
// trial status. Declarations and submissions arrive in M4/M5.
export default async function HomePage() {
  const me = await requireMember();
  const members = await listMembers();

  return (
    <div className="grid gap-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="m-0 font-en text-[clamp(1.4rem,7vw,1.8rem)] leading-none whitespace-nowrap [text-shadow:3px_3px_0_#fff,5px_5px_0_var(--ink)]">
          COMMIT OR TREAT
        </h1>
        <Link href="/settings" aria-label="プロフィールと設定">
          <Avatar
            name={me.display_name}
            src={me.avatar_url}
            colorIndex={Math.max(0, members.findIndex((member) => member.id === me.id))}
          />
        </Link>
      </header>

      {isInTrial(me.trial_ends_at) ? <TrialNotice trialEndsAt={me.trial_ends_at} /> : null}

      <Sticker className="grid gap-1 px-4 py-3.5">
        <b>ようこそ、{me.display_name} さん</b>
        <span className="text-sm font-medium text-sub">宣言と提出はこれから使えるようになります。</span>
      </Sticker>

      <section className="grid gap-3">
        <h2 className="m-0 font-en text-[1.4rem] leading-none">MEMBERS</h2>
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {members.map((member, index) => (
            <li key={member.id}>
              <Sticker shadow="sm" className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={member.display_name} src={member.avatar_url} colorIndex={index} />
                <span className="min-w-0 flex-1 truncate font-bold">{member.display_name}</span>
                {member.id === me.id ? <Pill variant="outline">あなた</Pill> : null}
                {member.is_admin ? <Pill>管理者</Pill> : null}
              </Sticker>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
