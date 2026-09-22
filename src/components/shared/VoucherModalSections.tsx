"use client";

import { History, Star, X } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { VoucherCard } from "@/src/components/shared/VoucherCards";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { VoucherModalTab } from "@/src/lib/utils/voucherModalHelpers";
import { cn } from "@/src/utils/cn";

interface VoucherModalTabsProps {
  activeTab: VoucherModalTab;
  isLoggedIn: boolean;
  voucherCount: number;
  onChange: (tab: VoucherModalTab) => void;
  tabs?: VoucherModalTab[];
  voucherTabLabel?: string;
}

interface VoucherModalFrameProps extends VoucherModalTabsProps {
  children: ReactNode;
  detailOpen?: boolean;
  pointsBalance?: number;
  title?: string;
  pointsLabel?: string;
  headerAction?: ReactNode;
  footer?: ReactNode;
  overlayContent?: ReactNode;
  onClose: () => void;
}

/** Render the shared wallet/cart voucher surface inside a desktop dialog or mobile sheet. */
export function VoucherModalFrame({
  activeTab,
  isLoggedIn,
  voucherCount,
  pointsBalance,
  title = "Ưu đãi",
  pointsLabel = "Điểm của bạn",
  tabs,
  voucherTabLabel,
  headerAction,
  footer,
  overlayContent,
  onChange,
  onClose,
  children,
  detailOpen = false,
}: VoucherModalFrameProps) {
  const touchStart = useRef({ x: 0, y: 0 });
  const visibleTabs = tabs ?? (isLoggedIn
    ? ["my_vouchers", "packages", "history"]
    : ["packages"]);

  const changeToAdjacentTab = (direction: "left" | "right") => {
    const currentIndex = visibleTabs.indexOf(activeTab);
    if (currentIndex < 0) return;
    const nextIndex = direction === "left"
      ? Math.min(currentIndex + 1, visibleTabs.length - 1)
      : Math.max(currentIndex - 1, 0);
    const nextTab = visibleTabs[nextIndex];
    if (nextTab && nextTab !== activeTab) onChange(nextTab);
  };

  return (
    <div data-slot="voucher-modal-frame" className="relative flex h-[85dvh] w-full flex-col overflow-hidden rounded-t-[2.5rem] bg-background shadow-2xl md:max-h-[85dvh] md:max-w-2xl md:rounded-[2.5rem]">
      {!detailOpen && <>
      <div className="absolute inset-x-0 top-3 z-10 mx-auto h-1.5 w-12 rounded-full bg-border/60 md:hidden" aria-hidden="true" />
      <header className="z-10 bg-background px-4 pb-3 pt-6 md:pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold text-primary">{title}</h2>
          <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        {(isLoggedIn || headerAction) && (
          <div className="flex min-h-8 items-center justify-between gap-3">
            {isLoggedIn ? (
              <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-bold text-primary">
                <Star size={14} className="text-amber-500" />
                {pointsLabel}: {(pointsBalance ?? 0).toLocaleString("vi-VN")} 🐟
              </p>
            ) : <span />}
            {headerAction}
          </div>
        )}
      </header>
      <VoucherModalTabs
        activeTab={activeTab}
        isLoggedIn={isLoggedIn}
        voucherCount={voucherCount}
        onChange={onChange}
        tabs={visibleTabs}
        voucherTabLabel={voucherTabLabel}
      />
      <div
        className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain px-4 py-4"
        onTouchStart={(event) => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
        onTouchEnd={(event) => {
          const dx = event.changedTouches[0].clientX - touchStart.current.x;
          const dy = event.changedTouches[0].clientY - touchStart.current.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            changeToAdjacentTab(dx < 0 ? "left" : "right");
          }
        }}
      >
        {children}
      </div>
      {footer}
      </>}
      {overlayContent}
    </div>
  );
}

/** Animate one in-frame voucher detail without participating in the frame layout. */
export function VoucherModalDetailTransition({ children }: { children: ReactNode }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}

/** Render the responsive three-tab selector for the unified voucher modal. */
export function VoucherModalTabs({
  activeTab,
  isLoggedIn,
  voucherCount,
  onChange,
  tabs,
  voucherTabLabel = "Voucher của tôi",
}: VoucherModalTabsProps) {
  const visibleTabs = tabs ?? (isLoggedIn
    ? ["my_vouchers", "packages", "history"]
    : ["packages"]);
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
        {visibleTabs.includes("my_vouchers") && (
          <button type="button" onClick={() => onChange("my_vouchers")} className={tabClassName("my_vouchers")}>
            {voucherTabLabel} {voucherCount > 0 && `(${voucherCount})`}
          </button>
        )}
        {visibleTabs.includes("packages") && (
          <button type="button" onClick={() => onChange("packages")} className={tabClassName("packages")}>
            Nhận ưu đãi
          </button>
        )}
        {visibleTabs.includes("history") && (
          <button type="button" onClick={() => onChange("history")} className={tabClassName("history")}>
            Lịch sử
          </button>
        )}
      </div>
    </div>
  );
}

/** Render redeemed and expired vouchers in a dedicated history section. */
export function VoucherHistorySection({
  vouchers,
  onVoucherClick,
}: {
  vouchers: MyVoucher[];
  onVoucherClick?: (voucher: MyVoucher) => void;
}) {
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
        <VoucherCard
          key={voucher.qr_token}
          voucher={voucher}
          onClick={onVoucherClick ? () => onVoucherClick(voucher) : undefined}
        />
      ))}
    </div>
  );
}
