import type { CalcOrderResult } from "@/src/utils/orderCalculator";
import { getStaffCartSummaryRows } from "@/src/lib/utils/staffCartPresentation";
import { CartMoney } from "./CartMoney";
import { cn } from "@/src/utils/cn";

/** Render the shared payment breakdown from canonical cart calculator totals. */
export function CartPaymentSummary({ totals }: { totals: CalcOrderResult }) {
  const rows = getStaffCartSummaryRows(totals);
  return (
    <dl aria-label="Chi tiết thanh toán" className="space-y-1 rounded-xl border border-border/50 bg-primary/5 px-3 py-2 text-xs">
      {rows.map((row, index) => (
        <div key={row.label} className={cn("flex items-baseline justify-between gap-3", row.discount && "text-red-700", index === rows.length - 1 && "border-t border-border/50 pt-2 font-bold text-primary")}>
          <dt>{row.label}</dt>
          <dd className="shrink-0 tabular-nums"><CartMoney amountVnd={row.amountVnd} discount={row.discount} /></dd>
        </div>
      ))}
    </dl>
  );
}
