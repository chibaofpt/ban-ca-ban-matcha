"use client";

import { History } from "lucide-react";
import { VoucherCard } from "@/src/components/shared/VoucherCards";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { VoucherModalTab } from "@/src/lib/utils/voucherModalHelpers";
import { cn } from "@/src/utils/cn";

interface VoucherModalTabsProps {
  activeTab: VoucherModalTab;
  isLoggedIn: boolean;
  voucherCount: number;
  onChange: (tab: VoucherModalTab) => void;
}

/** Render the responsive three-tab selector for the unified voucher modal. */
export function VoucherModalTabs({
  activeTab,
  isLoggedIn,
  voucherCount,
  onChange,
}: VoucherModalTabsProps) {
  const tabClassName = (tab: VoucherModalTab) =>
    cn(
      "relative -mb-px min-h-11 flex-1 border-b-2 px-1 text-sm font-bold transition-all",
      activeTab === tab
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="border-b border-border/50 px-4">
      <div className="flex gap-1">
        {isLoggedIn && (
          <button type="button" onClick={() => onChange("my_vouchers")} className={tabClassName("my_vouchers")}>
            Voucher của tôi {voucherCount > 0 && `(${voucherCount})`}
          </button>
        )}
        <button type="button" onClick={() => onChange("packages")} className={tabClassName("packages")}>
          Đổi thưởng
        </button>
        {isLoggedIn && (
          <button type="button" onClick={() => onChange("history")} className={tabClassName("history")}>
            Lịch sử
          </button>
        )}
      </div>
    </div>
  );
}

/** Render redeemed and expired vouchers in a dedicated history section. */
export function VoucherHistorySection({ vouchers }: { vouchers: MyVoucher[] }) {
  if (vouchers.length === 0) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 bg-secondary/10 py-16 text-center">
        <History size={32} className="text-primary/30" />
        <p className="text-sm font-bold text-primary/60">Chưa có lịch sử voucher</p>
        <p className="text-xs text-muted-foreground">Voucher đã dùng hoặc hết hạn sẽ hiện ở đây.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 pb-8 sm:grid-cols-2">
      {vouchers.map((voucher) => (
        <VoucherCard key={voucher.id} voucher={voucher} />
      ))}
    </div>
  );
}
