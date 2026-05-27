"use client";

import { useState, useEffect } from "react";
import { listMyVouchers, type MyVoucher } from "@/src/services/customerVoucherService";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, QrCode, Clock, CheckCircle2, XCircle, Ticket, ChevronDown, ChevronUp, Star, ShoppingBag } from "lucide-react";
import { cn } from "@/src/utils/cn";
import Link from "next/link";
import { useAddVoucherToCart } from "@/src/hooks/useAddVoucherToCart";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBenefit(v: MyVoucher): string {
  if (v.voucher_type === "DISCOUNT") {
    if (v.discount_type === "PERCENT") return `Giảm ${v.discount_value}% toàn đơn`;
    if (v.discount_type === "FIXED")
      return `Giảm ${v.discount_value?.toLocaleString("vi-VN")}đ toàn đơn`;
  }
  if (v.voucher_type === "PRODUCT") {
    const itemName = v.menuItem?.name ?? "Sản phẩm";
    return `${itemName}${v.size ? ` Size ${v.size}` : ""} miễn phí`;
  }
  if (v.voucher_type === "ADDON") {
    return `Topping ${v.addonOption?.label ?? "Addon"} miễn phí`;
  }
  if (v.voucher_type === "FREESHIP") {
    return `Freeship tối đa ${v.covered_delivery_fee_vnd?.toLocaleString("vi-VN") ?? "?đ"}`;
  }
  return v.package.name;
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "Vô thời hạn";
  const d = new Date(expiresAt);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Đã hết hạn";
  if (diffDays === 1) return "Hết hạn hôm nay";
  if (diffDays <= 7) return `Còn ${diffDays} ngày`;
  return `HSD: ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

type TabType = "active" | "used";

const VOUCHER_TYPE_CONFIG: Record<MyVoucher["voucher_type"], { label: string; color: string }> = {
  DISCOUNT: { label: "Giảm giá", color: "bg-blue-100 text-blue-800" },
  PRODUCT: { label: "Sản phẩm", color: "bg-green-100 text-green-800" },
  ADDON: { label: "Topping", color: "bg-purple-100 text-purple-800" },
  FREESHIP: { label: "Freeship", color: "bg-orange-100 text-orange-800" },
};

// ── QR Modal ──────────────────────────────────────────────────────────────────

function QrModal({ voucher, onClose }: { voucher: MyVoucher; onClose: () => void }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(voucher.qr_token)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-card rounded-2xl p-6 w-full max-w-xs shadow-2xl space-y-4"
      >
        <div className="text-center space-y-1">
          <h3 className="font-serif text-lg font-bold text-primary">Mã QR Voucher</h3>
          <p className="text-xs text-muted-foreground">{formatBenefit(voucher)}</p>
        </div>

        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="QR Code Voucher"
            className="w-56 h-56 rounded-xl border border-border"
          />
        </div>

        <div className="bg-secondary/30 rounded-xl p-3 text-xs text-center space-y-1">
          <p className="font-medium text-foreground">Đưa mã này cho nhân viên quét</p>
          <p className="text-muted-foreground font-mono text-[10px] break-all">{voucher.qr_token}</p>
        </div>

        {voucher.expires_at && (
          <p className="text-xs text-center text-muted-foreground">
            <Clock size={11} className="inline mr-1" />
            {formatExpiry(voucher.expires_at)}
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary/40 transition"
        >
          Đóng
        </button>
      </motion.div>
    </div>
  );
}

// ── VoucherCard ───────────────────────────────────────────────────────────────

function VoucherCard({
  voucher,
  onShowQr,
}: {
  voucher: MyVoucher;
  onShowQr: (v: MyVoucher) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { addToCart, loading: addingToCart } = useAddVoucherToCart();
  const typeConfig = VOUCHER_TYPE_CONFIG[voucher.voucher_type];
  const isActive = voucher.status === "ACTIVE";
  const isRedeemed = voucher.status === "REDEEMED";
  const isExpired = voucher.status === "EXPIRED";

  const handleDungNgay = async () => {
    const result = await addToCart(voucher);
    if (result.ok) {
      toast.success("Đã thêm vào giỏ hàng!");
    } else if (result.reason === "item_unavailable") {
      toast.error("Sản phẩm hiện không còn. Voucher có thể được hoàn điểm bởi admin.");
    } else if (result.reason === "size_unavailable") {
      toast.error("Size trong voucher hiện không còn bán.");
    } else {
      toast.error("Đặt hàng thất bại. Vui lòng thử lại.");
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl border bg-card shadow-sm overflow-hidden",
        !isActive && "opacity-60"
      )}
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0", typeConfig.color)}>
                {typeConfig.label}
              </span>
              {isRedeemed && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-600">
                  Đã dùng
                </span>
              )}
              {isExpired && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700">
                  Hết hạn
                </span>
              )}
            </div>
            <p className="font-bold text-sm text-foreground leading-tight">{voucher.package.name}</p>
            <p className="text-xs text-primary font-medium">{formatBenefit(voucher)}</p>
          </div>
          {isActive && (
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={() => onShowQr(voucher)}
                className="shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl bg-primary/5 hover:bg-primary/10 transition"
              >
                <QrCode size={20} className="text-primary" />
                <span className="text-[9px] font-bold text-primary">QR</span>
              </button>
              {voucher.voucher_type === "PRODUCT" && voucher.menuItem?.is_available && (
                <button
                  onClick={handleDungNgay}
                  disabled={addingToCart}
                  className="shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl bg-green-50 hover:bg-green-100 transition disabled:opacity-50"
                >
                  <ShoppingBag size={20} className="text-green-700" />
                  <span className="text-[9px] font-bold text-green-700">{addingToCart ? "..." : "Dùng"}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Info Row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {formatExpiry(voucher.expires_at)}
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-0.5 hover:text-foreground transition"
          >
            Chi tiết {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {/* Expanded detail */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-secondary/20 rounded-xl p-3 text-xs space-y-1.5">
                <p>
                  <span className="text-muted-foreground">Đổi bằng:</span>{" "}
                  <span className="font-medium">{voucher.package.points_cost} điểm 🐟</span>
                </p>
                {voucher.package.description && (
                  <p className="text-muted-foreground italic">{voucher.package.description}</p>
                )}
                <p className="text-muted-foreground font-mono text-[10px] break-all">
                  Mã: {voucher.qr_token}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export default function MyVouchersPage() {
  const [vouchers, setVouchers] = useState<MyVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("active");
  const [qrVoucher, setQrVoucher] = useState<MyVoucher | null>(null);

  useEffect(() => {
    listMyVouchers()
      .then(setVouchers)
      .catch(() => toast.error("Không tải được danh sách voucher"))
      .finally(() => setLoading(false));
  }, []);

  const activeVouchers = vouchers.filter((v) => v.status === "ACTIVE");
  const usedVouchers = vouchers.filter(
    (v) => v.status === "REDEEMED" || v.status === "EXPIRED" || v.status === "REFUNDED"
  );
  const displayed = activeTab === "active" ? activeVouchers : usedVouchers;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-5 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold text-primary">Túi Voucher 🎁</h1>
        <Link
          href="/rewards"
          className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/5 border border-primary/20 px-3 py-2 rounded-xl hover:bg-primary/10 transition"
        >
          <Star size={13} />
          Đổi thêm
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex bg-secondary/30 p-1 rounded-2xl">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "active" ? "bg-white shadow-sm text-primary" : "text-primary/60 hover:text-primary"
          }`}
        >
          Đang có{activeVouchers.length > 0 ? ` (${activeVouchers.length})` : ""}
        </button>
        <button
          onClick={() => setActiveTab("used")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "used" ? "bg-white shadow-sm text-primary" : "text-primary/60 hover:text-primary"
          }`}
        >
          Đã dùng
        </button>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-3"
        >
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border bg-card p-4 space-y-3 animate-pulse">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-16 bg-secondary/60 rounded-full" />
                    <div className="h-4 w-36 bg-secondary/40 rounded" />
                    <div className="h-3 w-28 bg-secondary/30 rounded" />
                  </div>
                  <div className="w-12 h-12 bg-secondary/30 rounded-xl" />
                </div>
              </div>
            ))
          ) : displayed.length === 0 ? (
            <div className="text-center py-20 bg-secondary/20 rounded-3xl border border-border/50 flex flex-col items-center gap-4">
              {activeTab === "active" ? (
                <>
                  <Ticket className="w-12 h-12 text-primary/30" />
                  <div>
                    <p className="font-bold text-primary">Bạn chưa có voucher nào</p>
                    <p className="text-sm text-primary/60 mt-1">Đổi điểm để nhận voucher nhé!</p>
                  </div>
                  <Link
                    href="/rewards"
                    className="flex items-center gap-2 bg-primary text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition"
                  >
                    <Gift size={15} />
                    Đến Quầy Đổi Thưởng
                  </Link>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-12 h-12 text-primary/30" />
                  <div>
                    <p className="font-bold text-primary">Chưa có voucher nào đã dùng</p>
                    <p className="text-sm text-primary/60 mt-1">Lịch sử sử dụng voucher sẽ hiện ở đây.</p>
                  </div>
                </>
              )}
            </div>
          ) : (
            displayed.map((v) => (
              <VoucherCard key={v.id} voucher={v} onShowQr={setQrVoucher} />
            ))
          )}
        </motion.div>
      </AnimatePresence>

      {/* QR Modal */}
      <AnimatePresence>
        {qrVoucher && (
          <QrModal voucher={qrVoucher} onClose={() => setQrVoucher(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
