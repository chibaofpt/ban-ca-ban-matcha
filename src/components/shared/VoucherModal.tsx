"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, QrCode, Star, Clock, Loader2, Ticket, Gift, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/src/utils/cn";

import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";
import { usePointsStore } from "@/src/lib/store/pointsStore";
import { useIsLoggedIn } from "@/src/lib/store/authStore";
import { apiClient } from "@/src/lib/api/client";
import {
  listMyVouchers,
  listActiveVoucherPackages,
  exchangeVoucher,
  type MyVoucher,
  type VoucherPackage,
} from "@/src/services/customerVoucherService";
import {
  filterModalVouchers,
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
        "rounded-2xl border bg-card shadow-sm overflow-hidden flex flex-col",
        !isInteractable && "opacity-50"
      )}
    >
      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Type badge + status */}
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

        {/* Name + benefit */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-foreground leading-tight line-clamp-2">
            {voucher.package.name}
          </p>
          <p className="text-xs text-primary font-medium mt-0.5">
            {getVoucherBenefitText(voucher)}
          </p>
        </div>

        {/* Expiry */}
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock size={10} />
          {formatVoucherExpiry(voucher.expires_at)}
        </p>
      </div>

      {/* QR button — only ACTIVE */}
      {isInteractable && (
        <button
          onClick={() => onShowQr(voucher)}
          className="w-full flex items-center justify-center gap-1.5 py-2 border-t border-border/50 text-xs font-bold text-primary hover:bg-primary/5 transition"
        >
          <QrCode size={13} />
          Hiện QR
        </button>
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
  // Pass 0 for redeemedCount — server validates the limit; UI only checks points + sold_out
  const { ok, reason } = canExchange(pkg, userBalance, 0);
  const typeConfig = VOUCHER_TYPE_CONFIG[pkg.voucher_type] ?? VOUCHER_TYPE_CONFIG.DISCOUNT;

  const btnLabel = (() => {
    if (isExchanging) return <Loader2 size={13} className="animate-spin" />;
    if (reason === "sold_out") return "Hết hàng";
    if (reason === "insufficient_points") {
      const needed = pkg.points_cost - userBalance;
      return `Cần thêm ${needed} điểm`;
    }
    return `Đổi ${pkg.points_cost} 🐟`;
  })();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border bg-card shadow-sm overflow-hidden flex flex-col"
    >
      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Type badge */}
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

        {/* Name + benefit */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-foreground leading-tight line-clamp-2">{pkg.name}</p>
          <p className="text-xs text-primary font-medium mt-0.5">{getPackageBenefitText(pkg)}</p>
        </div>

        {/* Expiry */}
        {pkg.expires_after_days !== null && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock size={10} />
            Hạn: {formatExpiryLabel(pkg.expires_after_days)}
          </p>
        )}
      </div>

      {/* Exchange button */}
      <button
        onClick={() => ok && !isExchanging && onExchange(pkg)}
        disabled={!ok || isExchanging}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 py-2 border-t border-border/50 text-xs font-bold transition",
          ok && !isExchanging
            ? "text-primary hover:bg-primary/5"
            : "text-muted-foreground cursor-not-allowed"
        )}
      >
        {btnLabel}
      </button>
    </motion.div>
  );
}

// ── VoucherModal (Main) ───────────────────────────────────────────────────────

export default function VoucherModal() {
  const { open, close } = useVoucherModalStore();
  const isLoggedIn = useIsLoggedIn();
  const points = usePointsStore((s) => s.points);
  const fetchPoints = usePointsStore((s) => s.fetchPoints);

  const [vouchers, setVouchers] = useState<MyVoucher[]>([]);
  const [packages, setPackages] = useState<VoucherPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [exchangingId, setExchangingId] = useState<string | null>(null);
  const [qrVoucher, setQrVoucher] = useState<MyVoucher | null>(null);

  // Fetch data when modal opens
  useEffect(() => {
    if (!open || !isLoggedIn) return;
    setLoading(true);
    fetchPoints();
    Promise.all([
      listMyVouchers(),
      listActiveVoucherPackages(),
    ])
      .then(([v, p]) => {
        setVouchers(v);
        setPackages(p);
      })
      .catch(() => toast.error("Không thể tải dữ liệu voucher"))
      .finally(() => setLoading(false));
  }, [open, isLoggedIn, fetchPoints]);

  async function handleExchange(pkg: VoucherPackage) {
    setExchangingId(pkg.id);
    try {
      await exchangeVoucher(pkg.id);
      toast.success(`Đổi thành công: ${pkg.name} 🎉`);
      // Refresh vouchers + points
      fetchPoints();
      const v = await listMyVouchers();
      setVouchers(v);
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { code?: string } } };
      const code = anyErr?.response?.data?.code ?? "UNKNOWN";
      toast.error(getExchangeErrorMessage(code, pkg.points_cost, points ?? 0));
    } finally {
      setExchangingId(null);
    }
  }

  const filteredVouchers = filterModalVouchers(vouchers);

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
            className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-50 p-0 md:p-4"
          >
            <div className="relative bg-background w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh]">

              {/* ── Sticky Header ── */}
              <div className="sticky top-0 bg-background rounded-t-2xl z-10 px-4 pt-4 pb-3 border-b border-border/50">
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
              <div className="overflow-y-auto flex-1 px-4 py-4 space-y-6">
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

                      {packages.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/10 py-10 flex flex-col items-center gap-2 text-center">
                          <Gift size={28} className="text-primary/30" />
                          <p className="text-sm font-bold text-primary/60">Chưa có gói đổi thưởng nào</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {packages.map((pkg) => (
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
