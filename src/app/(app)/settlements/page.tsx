import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/app/page-loading";
import { actionButtonVariants } from "@/components/brand/action-button";
import { Pill } from "@/components/brand/pill";
import { Barcode, Receipt, ReceiptRule } from "@/components/brand/receipt";
import { Sticker } from "@/components/brand/sticker";
import { PageTip } from "@/components/onboarding/page-tip";
import { PayeeSelect, SettlementButtons } from "@/components/settlement/settlement-actions";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatJstDay } from "@/lib/time";
import { TIPS } from "@/lib/tips";

export const metadata: Metadata = { title: "精算 | Commit or Treat" };

const STATUS: Record<string, string> = { open: "未送金", sent: "送金済み・確認待ち", completed: "完了" };

export default function SettlementsPage() {
  return (
    <div className="grid gap-6">
      <h1 className="m-0 font-heading text-[1.55rem] leading-tight font-normal">精算</h1>
      <p className="m-0 text-sm font-medium text-sub">
        毎週土曜 23:59 に、その週のペナルティの金額を支払先へまとめて払います。相殺はしません。次の精算までに「送金した」を押さないと
        500 円が追加されます。
      </p>
      <Suspense fallback={<PageLoading />}>
        <Settlements />
      </Suspense>
    </div>
  );
}

type Settlement = {
  id: string;
  debtor_id: string;
  payee_id: string;
  period_end: string;
  amount_yen: number;
  status: string;
};

async function Settlements() {
  const me = await requireMember();
  const supabase = await createClient();
  const [profiles, summary, settlements, settings] = await Promise.all([
    supabase.from("profiles").select("id, display_name, paypay_link, payee_id").is("deactivated_at", null).order("created_at"),
    supabase.from("penalty_summary").select("user_id, display_name, this_week_points, unsettled_points, trial_points, open_settlement_id"),
    supabase
      .from("settlements")
      .select("id, debtor_id, payee_id, period_end, amount_yen, status")
      .order("period_end", { ascending: false })
      .limit(40),
    supabase.from("group_settings").select("penalty_late_payment").single(),
  ]);
  if (profiles.error) throw profiles.error;
  if (summary.error) throw summary.error;
  if (settlements.error) throw settlements.error;
  if (settings.error) throw settings.error;

  const people = profiles.data;
  const name = (id: string) => people.find((person) => person.id === id)?.display_name ?? "メンバー";
  const payLink = (id: string) => people.find((person) => person.id === id)?.paypay_link ?? null;
  const myPayee = people.find((person) => person.id === me.id)?.payee_id ?? null;

  const toPay = settlements.data.filter((s) => s.debtor_id === me.id && s.status !== "completed");
  const toReceive = settlements.data.filter((s) => s.payee_id === me.id && s.status !== "completed");
  const ranking = [...summary.data].sort((a, b) => (b.unsettled_points ?? 0) - (a.unsettled_points ?? 0));

  return (
    <>
      {toPay.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">あなたが払う</h2>
          {toPay.map((s) => (
            <PayCard key={s.id} settlement={s} payeeName={name(s.payee_id)} payLink={payLink(s.payee_id)} />
          ))}
          <PageTip
            candidates={[
              toPay.some((s) => s.status === "open") && [
                "settlement",
                TIPS.settlement({ lateYen: settings.data.penalty_late_payment }),
              ],
            ]}
          />
        </section>
      ) : null}

      {toReceive.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">あなたが受け取る</h2>
          {toReceive.map((s) => (
            <Sticker key={s.id} className="grid gap-2 px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <b>
                  {name(s.debtor_id)} さんから {s.amount_yen.toLocaleString()} 円
                </b>
                <Pill variant="outline">{STATUS[s.status]}</Pill>
              </div>
              <span className="text-xs text-sub">{formatJstDay(s.period_end)} 締め</span>
              {s.status === "sent" ? <SettlementButtons settlementId={s.id} steps={["received", "not_received"]} /> : null}
            </Sticker>
          ))}
        </section>
      ) : null}

      <Receipt>
        <p className="m-0 text-center text-[0.82rem] tracking-widest">未精算のペナルティ</p>
        <ReceiptRule />
        <ol className="m-0 grid list-none gap-1.5 p-0 text-[0.95rem]">
          {ranking.map((row, index) => (
            <li key={row.user_id} className="grid grid-cols-[1.6em_1fr_auto] items-center gap-2 tabular-nums">
              <span>{index + 1}.</span>
              <span className="truncate">
                {row.display_name}
                {row.open_settlement_id ? <span className="ml-1.5 text-xs text-red">奢り確定</span> : null}
              </span>
              <span className="text-right">{(row.unsettled_points ?? 0).toLocaleString()}円</span>
            </li>
          ))}
        </ol>
        <ReceiptRule />
        <p className="m-0 text-[0.8rem]">
          お試し期間ぶん（請求なし）: {ranking.reduce((sum, row) => sum + (row.trial_points ?? 0), 0).toLocaleString()} 円
        </p>
        <Barcode />
      </Receipt>

      {myPayee === null ? (
        <Sticker tone="alert" className="grid gap-1 px-4 py-3">
          <b className="text-red">あなたの支払先がまだ決まっていません</b>
          <span className="text-sm font-medium">誰に払うかをグループで決めて、管理者に入力してもらってください。</span>
        </Sticker>
      ) : null}

      {me.is_admin ? (
        <section className="grid gap-3">
          <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">支払先（管理者）</h2>
          <p className="m-0 text-sm font-medium text-sub">グループで話し合って決めた「誰が誰に払うか」を入力します。変えると全員に通知されます。</p>
          <Sticker shadow="sm" className="grid gap-2.5 px-4 py-3">
            {people.map((person) => (
              <div key={person.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <span className="truncate text-sm font-bold">{person.display_name} →</span>
                <PayeeSelect
                  userId={person.id}
                  current={person.payee_id}
                  options={people.map((p) => ({ id: p.id, name: p.display_name }))}
                />
              </div>
            ))}
          </Sticker>
        </section>
      ) : null}

      <History settlements={settlements.data} name={name} />
    </>
  );
}

function PayCard({ settlement, payeeName, payLink }: { settlement: Settlement; payeeName: string; payLink: string | null }) {
  return (
    <Sticker tone="tape" className="grid gap-2.5 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <b className="text-lg">
          {payeeName} さんへ {settlement.amount_yen.toLocaleString()} 円
        </b>
        <Pill variant="outline">{STATUS[settlement.status]}</Pill>
      </div>
      <span className="text-xs">{formatJstDay(settlement.period_end)} 締め</span>
      {settlement.status === "open" ? (
        <div data-tip="settlement" className="grid gap-2.5">
          {payLink ? (
            <a href={payLink} target="_blank" rel="noreferrer" className={actionButtonVariants({ tone: "orange" })}>
              PayPay で送る
            </a>
          ) : (
            <p className="m-0 text-sm font-bold text-red">{payeeName} さんが PayPay の受け取りリンクを設定していません。直接やり取りしてください。</p>
          )}
          <SettlementButtons settlementId={settlement.id} steps={["sent"]} />
        </div>
      ) : (
        <p className="m-0 text-sm font-medium">{payeeName} さんが「受け取った」を押したら完了です。</p>
      )}
    </Sticker>
  );
}

function History({ settlements, name }: { settlements: Settlement[]; name: (id: string) => string }) {
  if (settlements.length === 0) return <p className="m-0 text-sm text-sub">まだ精算はありません</p>;
  return (
    <section className="grid gap-2">
      <h2 className="m-0 font-heading text-[1.2rem] leading-tight font-normal">これまでの精算</h2>
      <ul className="m-0 grid list-none gap-1.5 p-0 text-sm">
        {settlements.map((s) => (
          <li key={s.id} className="flex justify-between gap-2">
            <span>
              {formatJstDay(s.period_end)} {name(s.debtor_id)} → {name(s.payee_id)}
            </span>
            <span className="tabular-nums">
              {s.amount_yen.toLocaleString()} 円 ・ {STATUS[s.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
