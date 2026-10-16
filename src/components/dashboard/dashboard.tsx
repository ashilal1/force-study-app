import { Pill } from "@/components/brand/pill";
import { MemberCard } from "./member-card";
import { MyTodayCard } from "./my-today-card";
import { PenaltyReceipt } from "./penalty-receipt";
import type { DashboardData } from "./types";

export function Dashboard({ data }: { data: DashboardData }) {
  return (
    <div className="grid gap-5">
      <header className="grid justify-items-center gap-1.5 text-center">
        <Pill>
          {data.weekLabel} ・ 精算まで あと {data.daysToSettlement} 日
        </Pill>
        <h1 className="m-0 font-en text-[clamp(1.6rem,8vw,2rem)] leading-none whitespace-nowrap [text-shadow:3px_3px_0_#fff,5px_5px_0_var(--ink)]">
          COMMIT OR TREAT
        </h1>
      </header>

      <MyTodayCard me={data.me} />

      <section className="grid gap-3.5">
        <h2 className="m-0 font-en text-[1.55rem] leading-none">TODAY’S MISSIONS</h2>
        {data.members.map((member) => (
          <MemberCard key={member.id} member={member} />
        ))}
      </section>

      <PenaltyReceipt rows={data.ranking} isTrial={data.isTrial} />
    </div>
  );
}
