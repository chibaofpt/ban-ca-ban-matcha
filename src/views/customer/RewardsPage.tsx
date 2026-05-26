"use client";

import { useState, useEffect } from "react";
import {
  listActiveVoucherPackages,
  exchangeVoucher,
} from "@/src/services/customerVoucherService";
import { useIsLoggedIn } from "@/src/lib/store/authStore";
import { apiClient } from "@/src/lib/api/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ticket,
  Star,
  Gift,
  Zap,
  Clock,
  ChevronRight,
  BadgeCheck,
  Lock,
} from "lucide-react";
import { cn } from "@/src/utils/cn";

// ── Local Types ────────────────────────────────────────────────────────────────

type VoucherType = "DISCOUNT" | "PRODUCT" | "ADDON";

interface VoucherPackage {
  id: string;
  name: string;
  description: string | null;
  voucher_type: VoucherType;
  points_cost: number;
  discount_type: "PERCENT" | "FIXED" | null;
  discount_value: number | null;
  menu_item_id: string | null;
  size: "M" | "L" | "XL" | null;
  addon_option_id: string | null;
  covered_price_vnd: number | null;
  is_active: boolean;
  expires_after_days: number | null;
  quantity: number | null;
  max_per_user: number;
  created_at: string;
  menuItem?: { name: string; is_available: boolean } | null;
  addonOption?: { label: string } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBenefit(pkg: VoucherPackage): string {
  if (pkg.voucher_type === "DISCOUNT") {
    if (pkg.discount_type === "PERCENT") {
      return `Giảm ${pkg.discount_value}% toàn đơn`;
    }
    if (pkg.discount_type === "FIXED") {
      return `Giảm ${(pkg.discount_value ?? 0).toLocaleString("vi-VN")}đ toàn đơn`;
    }
  }
  if (pkg.voucher_type === "PRODUCT" && pkg.menuItem) {
    return `${pkg.menuItem.name} Size ${pkg.size} miễn phí`;
  }
  if (pkg.voucher_type === "ADDON" && pkg.addonOption) {
    return `Topping ${pkg.addonOption.label} miễn phí`;
  }
  return pkg.description ?? "Ưu đãi đặc biệt";
}

const TYPE_META: Record<
  VoucherType,
  { label: string; icon: React.ReactNode; badgeCls: string; accentCls: string }
> = {
  DISCOUNT: {
    label: "Giảm giá",
    icon: <Zap size={13} />,
    badgeCls: "bg-blue-100 text-blue-700 border-blue-200",
    accentCls: "from-blue-50 to-sky-50 border-blue-100",
  },
  PRODUCT: {
    label: "Sản phẩm",
    icon: <Gift size={13} />,
    badgeCls: "bg-emerald-100 text-emerald-700 border-emerald-200",
    accentCls: "from-emerald-50 to-green-50 border-emerald-100",
  },
  ADDON: {
    label: "Topping",
    icon: <Star size={13} />,
    badgeCls: "bg-purple-100 text-purple-700 border-purple-200",
    accentCls: "from-purple-50 to-violet-50 border-purple-100",
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function RewardsPage() {
  const isLoggedIn = useIsLoggedIn();
  const [userBalance, setUserBalance] = useState(0);

  const [packages, setPackages] = useState<VoucherPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [exchangingId, setExchangingId] = useState<string | null>(null);

  // Fetch points balance
  useEffect(() => {
    if (!isLoggedIn) return;
    apiClient
      .get<{ data: { points_balance: number } }>("/api/profile/points")
      .then((res) => setUserBalance(res.data.data.points_balance))
      .catch(() => {});
  }, [isLoggedIn]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listActiveVoucherPackages();
      setPackages(data as VoucherPackage[]);
    } catch {
      toast.error("Không thể tải danh sách gói thưởng.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const canExchange = (pkg: VoucherPackage): boolean =>
    userBalance >= pkg.points_cost &&
    (pkg.quantity === null || pkg.quantity > 0);

  const handleExchange = async (pkg: VoucherPackage) => {
    if (!canExchange(pkg)) return;
    setExchangingId(pkg.id);
    try {
      await exchangeVoucher(pkg.id);
      toast.success(
        `🎉 Đổi thành công! Voucher "${pkg.name}" đã được thêm vào ví của bạn.`
      );
      await load();
    } catch (err: any) {
      const code = err?.response?.data?.code;
      const messages: Record<string, string> = {
        INSUFFICIENT_POINTS: "Bạn không đủ điểm để đổi gói này.",
        VOUCHER_LIMIT_REACHED: "Bạn đã đạt giới hạn đổi gói này.",
        VOUCHER_SOLD_OUT: "Gói thưởng này đã hết hàng.",
        NOT_FOUND: "Không tìm thấy gói thưởng.",
      };
      toast.error(
        messages[code] ?? "Đổi thưởng thất bại. Vui lòng thử lại."
      );
    } finally {
      setExchangingId(null);
    }
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-6 pb-28">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold text-primary">
          🎁 Quầy Đổi Thưởng
        </h1>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="flex items-center gap-2 bg-primary text-primary-foreground rounded-2xl px-4 py-2 shadow-md w-fit"
        >
          <Star size={16} className="shrink-0" />
          <span className="text-sm font-semibold">
            Điểm của bạn:{" "}
            <span className="font-bold text-base">
              {userBalance.toLocaleString("vi-VN")}
            </span>{" "}
            🐟
          </span>
        </motion.div>
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl border bg-card p-4 space-y-3 animate-pulse"
              >
                <div className="flex justify-between items-center">
                  <div className="h-4 w-20 bg-secondary/60 rounded-full" />
                  <div className="h-4 w-28 bg-secondary/40 rounded-full" />
                </div>
                <div className="h-5 w-3/4 bg-secondary/50 rounded-lg" />
                <div className="h-4 w-1/2 bg-secondary/30 rounded-lg" />
                <div className="flex justify-between items-center pt-2 border-t border-border/50">
                  <div className="h-3 w-24 bg-secondary/40 rounded" />
                  <div className="h-9 w-32 bg-primary/20 rounded-xl" />
                </div>
              </div>
            ))}
          </motion.div>
        ) : packages.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center py-24 bg-secondary/20 rounded-3xl border border-border/50 flex flex-col items-center justify-center gap-3"
          >
            <Ticket className="w-14 h-14 text-primary/25" />
            <p className="font-bold text-primary text-lg">
              Chưa có gói thưởng nào
            </p>
            <p className="text-sm text-primary/60 max-w-[240px]">
              Các gói đổi thưởng sẽ sớm xuất hiện tại đây. Hãy quay lại sau
              nhé!
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {packages.map((pkg, i) => {
              const meta = TYPE_META[pkg.voucher_type];
              const affordable = canExchange(pkg);
              const isExchanging = exchangingId === pkg.id;
              const notEnoughPoints = userBalance < pkg.points_cost;
              const soldOut = pkg.quantity !== null && pkg.quantity <= 0;

              return (
                <motion.div
                  key={pkg.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.07 }}
                  className={cn(
                    "rounded-2xl border bg-card shadow-sm overflow-hidden transition-all duration-200",
                    !affordable && "opacity-60"
                  )}
                >
                  {/* Card top gradient stripe */}
                  <div
                    className={cn(
                      "bg-gradient-to-r px-4 pt-4 pb-3 border-b border-border/40",
                      meta.accentCls
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Type badge */}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border",
                          meta.badgeCls
                        )}
                      >
                        {meta.icon}
                        {meta.label}
                      </span>

                      {/* Quantity badge */}
                      {pkg.quantity !== null && (
                        <span
                          className={cn(
                            "text-[11px] font-semibold rounded-full px-2 py-0.5 border",
                            soldOut
                              ? "bg-red-100 text-red-600 border-red-200"
                              : "bg-white/70 text-foreground/60 border-border/50"
                          )}
                        >
                          {soldOut ? "Hết hàng" : `Còn ${pkg.quantity}`}
                        </span>
                      )}
                    </div>

                    <p className="font-bold text-base text-foreground mt-2 leading-snug">
                      {pkg.name}
                    </p>
                    <p className="text-sm text-foreground/70 mt-0.5 font-medium">
                      {formatBenefit(pkg)}
                    </p>
                  </div>

                  {/* Card body */}
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    {/* Left meta info */}
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {pkg.expires_after_days
                          ? `Hạn dùng: ${pkg.expires_after_days} ngày`
                          : "Vô thời hạn"}
                      </span>
                      {notEnoughPoints && !soldOut && (
                        <span className="flex items-center gap-1 text-amber-600 font-semibold">
                          <Lock size={11} />
                          Cần thêm{" "}
                          {(pkg.points_cost - userBalance).toLocaleString(
                            "vi-VN"
                          )}{" "}
                          điểm
                        </span>
                      )}
                      {!notEnoughPoints && !soldOut && (
                        <span className="flex items-center gap-1 text-primary font-semibold">
                          <BadgeCheck size={11} />
                          Đủ điểm để đổi
                        </span>
                      )}
                    </div>

                    {/* Exchange button */}
                    <button
                      id={`exchange-btn-${pkg.id}`}
                      onClick={() => handleExchange(pkg)}
                      disabled={!affordable || isExchanging}
                      className={cn(
                        "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 shrink-0",
                        affordable && !isExchanging
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md active:scale-95"
                          : "bg-secondary text-foreground/40 cursor-not-allowed"
                      )}
                    >
                      {isExchanging ? (
                        <>
                          <svg
                            className="animate-spin w-4 h-4"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v8z"
                            />
                          </svg>
                          Đang đổi…
                        </>
                      ) : (
                        <>
                          <ChevronRight size={15} />
                          Đổi {pkg.points_cost.toLocaleString("vi-VN")} điểm
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
