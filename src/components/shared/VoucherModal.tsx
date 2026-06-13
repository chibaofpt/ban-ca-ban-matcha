"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls, animate } from "framer-motion";
import { X, QrCode, Star, Clock, Loader2, Ticket, Gift, Zap } from "lucide-react";
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
  computePointsAfterExchange,
  VOUCHER_TYPE_CONFIG,
} from "@/src/lib/utils/voucherModalHelpers";
import { QrModal } from "./QrModal";

// ── VoucherCard (Section 1) ───────────────────────────────────────────────────

function VoucherCard({
  voucher,
  onShowQr,
}: {
  voucher: MyVoucher;
  onShowQr: (v: MyVoucher) => void;
}) {
  const isInteractable = canInteract(voucher);
  const typeConfig = VOUCHER_TYPE_CONFIG[voucher.voucher_type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border bg-card shadow-sm overflow-hidden flex items-center p-3 gap-3",
        !isInteractable && "opacity-50"
      )}
    >
      {/* Left: Info */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", typeConfig.badgeCls)}>
            {typeConfig.label}
          </span>
          {voucher.status === "RESERVED" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-yellow-100 text-yellow-700">
              Đang dùng
            </span>
          )}
        </div>
        <div>
          <p className="font-bold text-sm text-foreground leading-tight truncate">
            {voucher.package.name}
          </p>
          <p className="text-xs text-primary font-medium mt-0.5 truncate">
            {getVoucherBenefitText(voucher)}
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock size={10} />
          {formatVoucherExpiry(voucher.expires_at)}
        </p>
      </div>

      {/* Right: Action */}
      {isInteractable && (
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => onShowQr(voucher)}
          className="flex-shrink-0 flex flex-col items-center justify-center gap-1 bg-primary/10 text-primary rounded-lg px-3 py-2 hover:bg-primary/20 transition h-full min-w-[70px]"
        >
          <QrCode size={18} />
          <span className="text-[10px] font-bold">QR</span>
        </motion.button>
      )}
    </motion.div>
  );
}

// ── PackageCard (Section 2) ───────────────────────────────────────────────────

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

  // Calculate progress for insufficient points
  const progressPercent = Math.min(100, Math.round((userBalance / pkg.points_cost) * 100));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border bg-card shadow-sm overflow-hidden flex items-center p-3 gap-3 relative"
    >
      {/* Progress background if insufficient points */}
      {!ok && reason === "insufficient_points" && (
        <div 
          className="absolute left-0 bottom-0 top-0 bg-primary/5 transition-all duration-500 ease-out z-0"
          style={{ width: `${progressPercent}%` }}
        />
      )}

      {/* Left: Info */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5 relative z-10">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", typeConfig.badgeCls)}>
            {typeConfig.label}
          </span>
          {pkg.quantity !== null && pkg.quantity <= 10 && pkg.quantity > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700">
              Còn {pkg.quantity}
            </span>
          )}
        </div>
        <div>
          <p className="font-bold text-sm text-foreground leading-tight truncate">{pkg.name}</p>
          <p className="text-xs text-primary font-medium mt-0.5 truncate">{getPackageBenefitText(pkg)}</p>
        </div>
        {pkg.expires_after_days !== null && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock size={10} />
            Hạn: {formatExpiryLabel(pkg.expires_after_days)}
          </p>
        )}
      </div>

      {/* Right: Action or Progress */}
      <div className="flex-shrink-0 relative z-10 flex flex-col items-end justify-center min-w-[80px]">
        {(() => {
          if (isExchanging) {
            return (
              <div className="flex items-center justify-center h-9 w-full bg-primary/10 text-primary rounded-lg">
                <Loader2 size={16} className="animate-spin" />
              </div>
            );
          }
          if (reason === "sold_out") {
            return <span className="text-xs font-bold text-muted-foreground bg-secondary px-3 py-2 rounded-lg">Hết hàng</span>;
          }
          if (reason === "insufficient_points") {
            return (
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                  {userBalance} / {pkg.points_cost} 🐟
                </span>
                <span className="text-[10px] text-primary font-bold">
                  {progressPercent}%
                </span>
              </div>
            );
          }
          return (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => onExchange(pkg)}
              className="bg-primary text-primary-foreground text-xs font-bold px-3 py-2 rounded-lg hover:bg-primary/90 transition shadow-sm whitespace-nowrap"
            >
              Đổi {pkg.points_cost} 🐟
            </motion.button>
          );
        })()}
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

  // --- Pull-to-dismiss logic ---
  const y = useMotionValue<number | string>(0);
  const scale = useTransform(y, (latest) => {
    if (typeof latest === "string") return 1;
    if (latest < 0) return 1;
    if (latest > 300) return 0.9;
    return 1 - (latest / 300) * 0.1;
  });
  const dragControls = useDragControls();

  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!contentRef.current) return;
    const scrollTop = contentRef.current.scrollTop;
    const currentY = e.touches[0].clientY;

    if (scrollTop <= 0) {
      if (!isPulling.current) {
        touchStartY.current = currentY;
        isPulling.current = true;
      }
      const deltaY = currentY - touchStartY.current;
      if (deltaY > 0) {
        y.set(deltaY);
      } else {
        y.set(0);
      }
    } else {
      isPulling.current = false;
      if (typeof y.get() === "number" && (y.get() as number) > 0) y.set(0);
    }
  };

  const handleTouchEnd = () => {
    isPulling.current = false;
    if (typeof y.get() === "number" && (y.get() as number) > 100) {
      close();
    } else if (typeof y.get() === "number" && (y.get() as number) > 0) {
      animate(y, 0, { type: "spring", stiffness: 300, damping: 28 });
    }
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

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="voucher-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={close}
          />

          {/* Modal container */}
          <motion.div
            key="voucher-modal"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            style={{ y, scale, touchAction: "pan-y" }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(e, info) => {
              if (info.offset.y > 100 || info.velocity.y > 300) close();
            }}
            className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-50 p-0 md:p-4"
          >
            <div className="relative bg-background w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh]">

              {/* Mobile Drag Handle */}
              <div 
                onPointerDown={(e) => dragControls.start(e)}
                className="w-full flex justify-center pt-3 pb-1 md:hidden touch-none"
              >
                <div className="w-12 h-1.5 bg-border/60 rounded-full" />
              </div>

              {/* ── Sticky Header ── */}
              <div 
                onPointerDown={(e) => dragControls.start(e)}
                className="sticky top-0 bg-background md:rounded-t-2xl z-10 px-4 pt-2 md:pt-4 pb-3 border-b border-border/50 touch-none"
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-serif text-lg font-bold text-primary">Voucher của tôi 🎁</h2>
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

              {/* ── Scrollable Body ── */}
              <div 
                ref={contentRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="overflow-y-auto overscroll-contain flex-1 px-4 py-4 space-y-6"
              >
                {loading ? (
                  <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                    <Loader2 size={28} className="animate-spin text-primary" />
                    <p className="text-sm">Đang tải...</p>
                  </div>
                ) : (
                  <>
                    {/* Section 1: My Vouchers */}
                    <section>
                      <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-1.5">
                        <Ticket size={14} className="text-primary" />
                        Voucher đang có
                        {filteredVouchers.length > 0 && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            ({filteredVouchers.length})
                          </span>
                        )}
                      </h3>

                      {filteredVouchers.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/10 py-10 flex flex-col items-center gap-2 text-center">
                          <Ticket size={28} className="text-primary/30" />
                          <p className="text-sm font-bold text-primary/60">Bạn chưa có voucher nào</p>
                          <p className="text-xs text-muted-foreground">Đổi điểm để nhận voucher ở bên dưới nhé!</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {filteredVouchers.map((v) => (
                            <VoucherCard key={v.id} voucher={v} onShowQr={setQrVoucher} />
                          ))}
                        </div>
                      )}
                    </section>

                    {/* Section 2: Exchange Packages */}
                    <section>
                      <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-1.5">
                        <Gift size={14} className="text-primary" />
                        Đổi thưởng
                      </h3>

                      {filteredPackages.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/10 py-10 flex flex-col items-center gap-2 text-center">
                          <Gift size={28} className="text-primary/30" />
                          <p className="text-sm font-bold text-primary/60">Chưa có gói đổi thưởng nào</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    </section>
                  </>
                )}
              </div>
            </div>
          </motion.div>

          {/* QR Modal — stacked on top */}
          <AnimatePresence>
            {qrVoucher && (
              <QrModal voucher={qrVoucher} onClose={() => setQrVoucher(null)} />
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
