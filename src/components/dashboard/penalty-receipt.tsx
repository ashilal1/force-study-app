import { actionButtonVariants } from "@/components/brand/action-button";
import { Barcode, Receipt, ReceiptRule } from "@/components/brand/receipt";
import type { WeeklyPenaltyRow } from "./types";

const DOTS = 3;

function dots(failedDays: number) {
  const filled = Math.min(failedDays, DOTS);
  return "●".repeat(filled) + "○".repeat(DOTS - filled) + (failedDays > DOTS ? "+" : "");
}

export function PenaltyReceipt({ rows, isTrial }: { rows: WeeklyPenaltyRow[]; isTrial: boolean }) {
  return (
    <Receipt>
      <p className="m-0 text-center text-[0.82rem] tracking-widest">今週のペナルティ（日〜土）</p>
      <ReceiptRule />
      <ol className="m-0 grid list-none gap-1.5 p-0 text-[0.95rem]">
        {rows.map((row, index) => (
          <li key={row.memberId} className="grid grid-cols-[1.6em_1fr_auto_5.4em] items-center gap-2 tabular-nums">
            <span>{index + 1}.</span>
            <span className="truncate">{row.name}</span>
            <span>[{dots(row.failedDays)}]</span>
            <span className="text-right">{row.amountYen.toLocaleString()}円</span>
          </li>
        ))}
      </ol>
      <ReceiptRule />
      <div className="flex justify-between text-[0.8rem]">
        <span>● = 失敗した日</span>
        <span>{isTrial ? "お試し期間（請求なし）" : "土曜 23:59 締め"}</span>
      </div>
      <a href="/settlements" className={actionButtonVariants({ tone: "orange" })}>
        PayPay で精算
      </a>
      <Barcode />
    </Receipt>
  );
}
