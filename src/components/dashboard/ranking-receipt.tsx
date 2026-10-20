import Link from "next/link";
import { actionButtonVariants } from "@/components/brand/action-button";
import { Barcode, Receipt, ReceiptRule } from "@/components/brand/receipt";

export type RankingRow = {
  userId: string;
  name: string;
  thisWeek: number;
  /** Trial members: what this week would have cost (「本番なら」). */
  thisWeekTrial: number;
  total: number;
  /** An open settlement: the PayPay button shows. */
  owes: boolean;
  /** 貧乏人 (F13): a settlement past its deadline (P7). */
  broke: boolean;
};

/** This week's penalties (unsettled, Sunday-Saturday), with the running total and 貧乏人. */
export function RankingReceipt({ rows, iOwe }: { rows: RankingRow[]; iOwe: boolean }) {
  const ranked = [...rows].sort((a, b) => b.thisWeek + b.thisWeekTrial - (a.thisWeek + a.thisWeekTrial) || b.total - a.total);
  return (
    <Receipt>
      <p className="m-0 text-center text-[0.82rem] tracking-widest">今週のペナルティ（日〜土）</p>
      <ReceiptRule />
      <ol className="m-0 grid list-none gap-1.5 p-0 text-[0.95rem]">
        {ranked.map((row, index) => (
          <li key={row.userId} className="grid grid-cols-[1.6em_1fr_auto] items-center gap-2 tabular-nums">
            <span>{index + 1}.</span>
            <span className="truncate">
              {row.name}
              {row.broke ? <span className="ml-1.5 text-xs text-red">貧乏人</span> : null}
            </span>
            <span className="text-right">
              {row.thisWeekTrial > 0 ? (
                <span className="text-xs">本番なら {row.thisWeekTrial.toLocaleString()}円</span>
              ) : (
                `${row.thisWeek.toLocaleString()}円`
              )}
              <span className="block text-[0.7rem] text-sub">累計 {row.total.toLocaleString()}円</span>
            </span>
          </li>
        ))}
      </ol>
      <ReceiptRule />
      <div className="flex justify-between text-[0.8rem]">
        <span>PayPay でまとめて払う</span>
        <span>土曜 23:59 締め</span>
      </div>
      {iOwe ? (
        <Link href="/settlements" className={actionButtonVariants({ tone: "orange" })}>
          PayPay で精算
        </Link>
      ) : null}
      <Barcode />
    </Receipt>
  );
}
