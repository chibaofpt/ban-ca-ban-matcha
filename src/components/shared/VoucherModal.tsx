"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DismissableSheet } from "@/src/components/ui/DismissableSheet";
import { X, QrCode, Star, Clock, Loader2, Ticket, Gift } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/src/utils/cn";

import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";
import { useIsLoggedIn } from "@/src/lib/store/authStore";
import { useCustomerPoints } from "@/src/hooks/useCustomerPoints";
import { useCustomerVouchers } from "@/src/hooks/useCustomerVouchers";
import { useVoucherPackages } from "@/src/hooks/useVoucherPackages";
import { useExchangeVoucher } from "@/src/hooks/useExchangeVoucher";
import {
  type MyVoucher,
  type VoucherPackage,
} from "@/src/services/customerVoucherService";
import {
  filterModalVouchers,
  filterModalPackages,
  canInteract,
  canExchange,
  getExchangeErrorMessage,
  getVoucherBenefitText,
  getPackageBenefitText,
  formatExpiryLabel,
  formatVoucherExpiry,
  formatRedeemedDate,
  getTicketHighlightText,
  VOUCHER_TYPE_CONFIG,
} from "@/src/lib/utils/voucherModalHelpers";
import { QrModal } from "./QrModal";

// ── VoucherCard (Section 1 - Ticket Layout) ───────────────────────────────────

function VoucherCard({
  voucher,
  onShowQr,
}: {
  voucher: MyVoucher;
  onShowQr: (v: MyVoucher) => void;
}) {
  const isInteractable = canInteract(voucher);
  const typeConfig = VOUCHER_TYPE_CONFIG[voucher.voucher_type];
  const highlight = getTicketHighlightText(voucher.voucher_type, voucher.discount_type, voucher.discount_value);

  const isExpired = voucher.status === "EXPIRED";
  const isRedeemed = voucher.status === "REDEEMED";
  const isReserved = voucher.status === "RESERVED";
  const isDimmed = isExpired || isRedeemed;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "rounded-xl bg-card shadow-sm border overflow-hidden flex relative",
        isDimmed && "opacity-60 grayscale-[40%]"
      )}
    >
      {/* Left side: Highlight Ticket */}
      <div className={cn(
        "w-[32%] flex flex-col items-center justify-center p-3 border-r-2 border-dashed border-border/60",
        isDimmed ? "bg-muted/50 text-muted-foreground" : "bg-primary/5 text-primary"
      )}>
        <span className="font-black text-xl lg:text-2xl tracking-tighter leading-none text-center">{highlight.text}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 mt-1">{highlight.subtext}</span>
      </div>

      {/* Right side: Info */}
      <div className="flex-1 min-w-0 p-3 flex flex-col justify-center bg-card z-10">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", typeConfig.badgeCls)}>
            {typeConfig.label}
          </span>
          {isReserved && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-yellow-100 text-yellow-700">
              Đang dùng
            </span>
          )}
          {isExpired && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-muted-foreground/20 text-muted-foreground">
              Hết hạn
            </span>
          )}
          {isRedeemed && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-muted-foreground/20 text-muted-foreground">
              Đã dùng
            </span>
          )}
        </div>
        
        <p className="font-bold text-sm text-foreground leading-tight line-clamp-1">
          {voucher.package.name}
        </p>
        <p className="text-xs text-primary font-medium mt-0.5 line-clamp-1">
          {getVoucherBenefitText(voucher)}
        </p>

        <div className="mt-2 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock size={10} />
            {isRedeemed ? formatRedeemedDate(voucher.redeemed_at) : formatVoucherExpiry(voucher.expires_at)}
          </p>
          
          {isInteractable && (
            <button
              onClick={(e) => { e.stopPropagation(); onShowQr(voucher); }}
              className="bg-primary/10 text-primary p-1.5 rounded-md hover:bg-primary/20 transition-colors"
            >
              <QrCode size={16} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── PackageCard (Section 2 - Ticket Layout) ───────────────────────────────────

function PackageCard({
  pkg,
  userBalance,
  onExchange,
  isExchanging,
}: {
  pkg: VoucherPackage;
  userBalance: number;
  onExchange: (pkg: VoucherPackage) => void;
  isExchanging: boolean;
}) {
  const { ok, reason } = canExchange(pkg, userBalance, pkg.user_redeemed_count ?? 0);
  const typeConfig = VOUCHER_TYPE_CONFIG[pkg.voucher_type] ?? VOUCHER_TYPE_CONFIG.DISCOUNT;
  const highlight = getTicketHighlightText(pkg.voucher_type, pkg.discount_type, pkg.discount_value);

  // Calculate progress for insufficient points
  const progressPercent = Math.min(100, Math.round((userBalance / pkg.points_cost) * 100));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl bg-card shadow-sm border overflow-hidden flex relative"
    >
      {/* Progress background if insufficient points */}
      {!ok && reason === "insufficient_points" && (
        <div 
          className="absolute left-0 bottom-0 top-0 bg-primary/5 transition-all duration-500 ease-out z-0"
          style={{ width: `${progressPercent}%` }}
        />
      )}

      {/* Left side: Highlight Ticket */}
      <div className="w-[32%] flex flex-col items-center justify-center p-3 border-r-2 border-dashed border-border/60 bg-primary/5 text-primary z-10">
        <span className="font-black text-xl lg:text-2xl tracking-tighter leading-none text-center">{highlight.text}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 mt-1">{highlight.subtext}</span>
      </div>

      {/* Right side: Info */}
      <div className="flex-1 min-w-0 p-3 flex flex-col justify-center z-10 bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", typeConfig.badgeCls)}>
            {typeConfig.label}
          </span>
          {pkg.quantity !== null && pkg.quantity <= 10 && pkg.quantity > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700">
              Còn {pkg.quantity}
            </span>
          )}
        </div>

        <p className="font-bold text-sm text-foreground leading-tight line-clamp-1">{pkg.name}</p>
        <p className="text-xs text-primary font-medium mt-0.5 line-clamp-1">{getPackageBenefitText(pkg)}</p>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {pkg.expires_after_days !== null ? (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock size={10} />
              Hạn: {formatExpiryLabel(pkg.expires_after_days)}
            </p>
          ) : <div />}

          <div className="flex-shrink-0">
            {(() => {
              if (isExchanging) {
                return (
                  <div className="flex items-center justify-center h-7 w-20 bg-primary/10 text-primary rounded-md">
                    <Loader2 size={14} className="animate-spin" />
                  </div>
                );
              }
              if (reason === "sold_out") {
                return <span className="text-[10px] font-bold text-muted-foreground bg-secondary px-2 py-1 rounded-md">Hết hàng</span>;
              }
              if (reason === "limit_reached") {
                return <span className="text-[10px] font-bold text-muted-foreground bg-secondary px-2 py-1 rounded-md">Đã đủ giới hạn</span>;
              }
              if (reason === "insufficient_points") {
                return (
                  <div className="flex flex-col items-end leading-tight">
                    <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                      {userBalance} / {pkg.points_cost} 🐟
                    </span>
                  </div>
                );
              }
              return (
                <button
                  onClick={() => onExchange(pkg)}
                  className="bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1.5 rounded-md hover:bg-primary/90 transition shadow-sm whitespace-nowrap"
                >
                  Đổi {pkg.points_cost} 🐟
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── VoucherModal (Main) ───────────────────────────────────────────────────────

export default function VoucherModal() {
  const { open, close } = useVoucherModalStore();
  const isLoggedIn = useIsLoggedIn();
  const { data: points } = useCustomerPoints();

  const { data: vouchers = [], isLoading: vLoading } = useCustomerVouchers({ enabled: open && isLoggedIn });
  const { data: packages = [], isLoading: pLoading } = useVoucherPackages({ enabled: open && isLoggedIn });
  const exchangeMutation = useExchangeVoucher();

  const loading = vLoading || pLoading;
  const [exchangingId, setExchangingId] = useState<string | null>(null);
  const [qrVoucher, setQrVoucher] = useState<MyVoucher | null>(null);
  const [activeTab, setActiveTab] = useState<"my_vouchers" | "packages">("my_vouchers");

  // Pull-to-dismiss + horizontal-swipe logic.
  // Vertical pull-to-dismiss: DismissableSheet handles via contentHandlers.
  // Horizontal swipe (tab switching): wrapped in handleContentTouchEnd below.
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  /** Extended onTouchEnd: wraps DismissableSheet's handler to also detect horizontal swipe (QA R8). */
  const buildTouchEndHandler = (
    baseOnTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => void
  ) => (e: React.TouchEvent<HTMLDivElement>) => {
    baseOnTouchEnd(e);
    const currentX = e.changedTouches[0].clientX;
    const currentY = e.changedTouches[0].clientY;
    const deltaX = currentX - touchStartX.current;
    const deltaY = currentY - touchStartY.current;
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0 && activeTab === "my_vouchers") {
        setActiveTab("packages");
      } else if (deltaX > 0 && activeTab === "packages") {
        setActiveTab("my_vouchers");
      }
    }
  };

  /** Capture touch start X/Y for horizontal swipe detection. */
  const handleContentTouchStart = (
    baseOnTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void
  ) => (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    baseOnTouchStart(e);
  };

  async function handleExchange(pkg: VoucherPackage) {
    setExchangingId(pkg.id);
    try {
      await exchangeMutation.mutateAsync(pkg.id);
      toast.success(`Đổi thành công: ${pkg.name} 🎉`);
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { code?: string } } };
      const code = anyErr?.response?.data?.code ?? "UNKNOWN";
      toast.error(getExchangeErrorMessage(code, pkg.points_cost, points ?? 0));
    } finally {
      setExchangingId(null);
    }
  }

  const filteredVouchers = filterModalVouchers(vouchers);
  const filteredPackages = filterModalPackages(packages);

  // Body scroll lock is handled by DismissableSheet.


  // Framer motion variants for tab switching
  const tabVariants = {
    initial: (direction: number) => ({
      opacity: 0,
      x: direction > 0 ? 50 : -50,
    }),
    animate: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.2, ease: "easeOut" as const },
    },
    exit: (direction: number) => ({
      opacity: 0,
      x: direction < 0 ? 50 : -50,
      transition: { duration: 0.2, ease: "easeIn" as const },
    }),
  };
  const direction = activeTab === "my_vouchers" ? -1 : 1;

  return (
    <DismissableSheet
      open={open}
      onClose={close}
      springDamping={28}
      springStiffness={300}
      initialAnimation={{ opacity: 0, y: 40 }}
      animateAnimation={{ opacity: 1, y: 0 }}
      exitAnimation={{ opacity: 0, y: 40 }}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      zIndexBackdrop={40}
      zIndexSheet={50}
      sheetClassName="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center p-0 md:p-4"
      dragHandleContent={
        <div className="w-full flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-12 h-1.5 bg-border/60 rounded-full" />
        </div>
      }
    >
      {({ onTouchStart, onTouchMove, onTouchEnd, ref: contentRef }) => (
        <>
          <div className="relative bg-background w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col h-[85vh] md:max-h-[85vh]">

            {/* ── Sticky Header ── */}
            <div className="bg-background md:rounded-t-2xl z-10 px-4 pt-2 md:pt-4 pb-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-serif text-lg font-bold text-primary">Ví Voucher 🎁</h2>
                <button
                  onClick={close}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary/60 transition text-muted-foreground"
                  aria-label="Đóng"
                >
                  <X size={18} />
                </button>
              </div>
              {/* Points badge */}
              <div className="inline-flex items-center gap-1.5 bg-primary/5 border border-primary/20 rounded-full px-3 py-1.5 text-sm font-bold text-primary">
                <Star size={14} className="text-amber-500" />
                <span>Điểm của bạn: {(points ?? 0).toLocaleString("vi-VN")} 🐟</span>
              </div>
            </div>

            {/* ── Text Tabs ── */}
            <div className="px-4 border-b border-border/50">
              <div className="flex gap-6">
                <button
                  onClick={() => setActiveTab("my_vouchers")}
                  className={cn(
                    "pb-3 text-sm font-bold transition-all border-b-2 relative -mb-[1px]",
                    activeTab === "my_vouchers"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  Voucher của tôi {filteredVouchers.length > 0 && `(${filteredVouchers.length})`}
                </button>
                <button
                  onClick={() => setActiveTab("packages")}
                  className={cn(
                    "pb-3 text-sm font-bold transition-all border-b-2 relative -mb-[1px]",
                    activeTab === "packages"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  Đổi thưởng
                </button>
              </div>
            </div>

            {/* ── Scrollable Body — touch handlers extended for horizontal swipe ── */}
            <div
              ref={contentRef}
              onTouchStart={handleContentTouchStart(onTouchStart)}
              onTouchMove={onTouchMove}
              onTouchEnd={buildTouchEndHandler(onTouchEnd)}
              className="overflow-y-auto overscroll-contain flex-1 relative"
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <Loader2 size={28} className="animate-spin text-primary" />
                  <p className="text-sm">Đang tải...</p>
                </div>
              ) : (
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={activeTab}
                    custom={direction}
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="absolute inset-0 px-4 py-4 h-max"
                  >
                    {activeTab === "my_vouchers" ? (
                      /* Section 1: My Vouchers */
                      <div>
                        {filteredVouchers.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/10 py-16 flex flex-col items-center gap-2 text-center mt-4">
                            <Ticket size={32} className="text-primary/30" />
                            <p className="text-sm font-bold text-primary/60">Bạn chưa có voucher nào</p>
                            <p className="text-xs text-muted-foreground">Qua tab Đổi thưởng để lấy voucher nhé!</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-8">
                            {filteredVouchers.map((v) => (
                              <VoucherCard key={v.id} voucher={v} onShowQr={setQrVoucher} />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Section 2: Exchange Packages */
                      <div>
                        {filteredPackages.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/10 py-16 flex flex-col items-center gap-2 text-center mt-4">
                            <Gift size={32} className="text-primary/30" />
                            <p className="text-sm font-bold text-primary/60">Chưa có gói đổi thưởng</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-8">
                            {filteredPackages.map((pkg) => (
                              <PackageCard
                                key={pkg.id}
                                pkg={pkg}
                                userBalance={points ?? 0}
                                onExchange={handleExchange}
                                isExchanging={exchangingId === pkg.id}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* QR Modal — stacked on top */}
          <AnimatePresence>
            {qrVoucher && (
              <QrModal voucher={qrVoucher} onClose={() => setQrVoucher(null)} />
            )}
          </AnimatePresence>
        </>
      )}
    </DismissableSheet>
  );
}
