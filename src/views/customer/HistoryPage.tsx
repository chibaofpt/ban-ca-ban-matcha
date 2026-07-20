"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cancelOrder, fetchCustomerOrders } from "@/src/services/orderService";
import { listMyVouchers, type MyVoucher } from "@/src/services/customerVoucherService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Clock, Copy, CheckCircle2, XCircle, Ticket, Fish, ArrowRightLeft, User, ShieldCheck, Gift } from "lucide-react";
import { cn } from "@/src/utils/cn";
import { CountdownTimer } from "@/src/components/customer/CountdownTimer";
import { OrderProgressBar } from "@/src/components/shared/OrderProgressBar";
import { OrderItemDetails } from "@/src/components/shared/OrderItemDetails";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import type { OrderStatus } from "@/src/lib/types/order";
import VoucherModal from "@/src/components/shared/VoucherModal";
import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";
import { useCustomerPoints } from "@/src/hooks/useCustomerPoints";
import { useIsLoggedIn } from "@/src/lib/store/authStore";

interface CustomerHistoryOrder {
  id: string;
  order_code: string | null;
  status: OrderStatus;
  order_type: string;
  total_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  subtotal_vnd: number;
  total_voucher_discount_vnd: number;
  created_at: string;
  auto_cancel_at: string | null;
  payment_qr_url: string | null;
  discountVouchers?: Array<{ voucher: { package: { name: string } } }>;
  items: Array<{
    quantity: number;
    size: string;
    unit_price_vnd: number;
    addons_price_vnd: number;
    sweetness: string;
    ice_option: string;
    coldwhisk: boolean;
    note: string | null;
    menuItem: { name: string; category: string };
    productVoucher?: { package: { name: string } } | null;
    addonVouchers?: Array<{ voucher: { package: { name: string } } }>;
    selectedPowder: { name: string; price_per_gram: number } | null;
    milkType: { name: string; is_default: boolean } | null;
    addons: Array<{
      unit_price_vnd: number;
      quantity: number;
      addonOption: {
        label: string;
        gram_value: string | null;
        price_vnd: number;
        group: { name: string };
      };
    }>;
  }>;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} • ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

function formatBenefit(v: MyVoucher): string {
  if (v.voucher_type === "DISCOUNT") {
    if (v.discount_type === "PERCENT") return `Giảm ${v.discount_value}% toàn đơn`;
    if (v.discount_type === "FIXED") return `Giảm ${(v.discount_value ?? 0).toLocaleString("vi-VN")}đ`;
  }
  if (v.voucher_type === "PRODUCT" && v.menuItem) {
    return `${v.menuItem.name} Size ${v.size} miễn phí`;
  }
  if (v.voucher_type === "ADDON" && v.addonOption) {
    return `Topping ${v.addonOption.label} miễn phí`;
  }
  return v.package.name;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  ACTIVE:   { label: "Đang có hiệu lực", cls: "bg-green-100 text-green-700" },
  RESERVED: { label: "Đang được đặt giữ", cls: "bg-yellow-100 text-yellow-700" },
  REDEEMED: { label: "Đã sử dụng", cls: "bg-gray-100 text-gray-600" },
  EXPIRED:  { label: "Hết hạn", cls: "bg-red-100 text-red-600" },
  REFUNDED: { label: "Đã hoàn lại", cls: "bg-blue-100 text-blue-700" },
};

/** Một card lịch sử voucher, hiển thị 2 dòng timeline: đổi + sử dụng (nếu có). */
function VoucherHistoryCard({ voucher: v }: { voucher: MyVoucher }) {
  const statusCfg = STATUS_CONFIG[v.status] ?? STATUS_CONFIG.ACTIVE;
  const isRedeemed = v.status === "REDEEMED" || v.status === "REFUNDED";

  // Who redeemed it?
  const redeemedByLabel = (() => {
    if (!v.redeemed_at) return null;
    if (v.redeemed_by && v.staff) {
      const role = v.staff.role === "ADMIN" ? "Admin" : "Nhân viên";
      return `${role} ${v.staff.name} đã sử dụng`;
    }
    // Redeemed by user themselves
    return v.used_channel === "OFFLINE" ? "Bạn đã sử dụng tại quầy" : "Bạn đã sử dụng online";
  })();

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Header: tên + status badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-sm text-foreground leading-tight">{v.package.name}</p>
            <p className="text-xs text-primary font-medium mt-0.5">{formatBenefit(v)}</p>
          </div>
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0", statusCfg.cls)}>
            {statusCfg.label}
          </span>
        </div>

        {/* Timeline */}
        <div className="space-y-2 pl-1">
          {/* Event 1: Đổi điểm */}
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ArrowRightLeft size={12} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">
                Bạn đã đổi{" "}
                <span className="text-primary">{v.package.points_cost} điểm 🐟</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <Clock size={10} />
                {formatDate(v.created_at)}
              </p>
            </div>
          </div>

          {/* Event 2: Sử dụng (nếu có) */}
          {isRedeemed && v.redeemed_at && (
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                {v.redeemed_by && v.staff ? (
                  <ShieldCheck size={12} className="text-gray-500" />
                ) : (
                  <User size={12} className="text-gray-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{redeemedByLabel}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Clock size={10} />
                  {formatDate(v.redeemed_at)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Page lịch sử đơn hàng và voucher của khách hàng. */
export default function HistoryPage() {
  const queryClient = useQueryClient();
  const openVoucherModal = useVoucherModalStore((s) => s.openModal);
  const isLoggedIn = useIsLoggedIn();
  const { data: points } = useCustomerPoints();
  
  const [activeTab, setActiveTab] = useState<"orders" | "vouchers">("orders");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<{
    isOpen: boolean;
    orderId: string;
  }>({ isOpen: false, orderId: "" });

  // Voucher history state is now managed by TanStack Query
  // The UI can use isVouchersLoading and vouchers directly

  // Reset page when changing tabs (though vouchers tab currently has no pagination)
  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  // Points are automatically fetched by useCustomerPoints hook
  useEffect(() => {}, [isLoggedIn]);

  const { data: vouchersData, isLoading: vouchersLoading } = useQuery({
    queryKey: ["customer", "vouchers"],
    queryFn: listMyVouchers,
    enabled: activeTab === "vouchers",
  });
  
  const vouchers = vouchersData || [];

  const fetchOrdersFn = useCallback(async () => {
    return await fetchCustomerOrders({ page, limit: 10 });
  }, [page]);

  const { data: queryData, isLoading: isInitialLoading } = useQuery({
    queryKey: ["customer", "orders", { page }],
    queryFn: fetchOrdersFn,
    refetchInterval: 15000,
    enabled: activeTab === "orders",
  });

  const rawOrders: CustomerHistoryOrder[] = queryData?.data || [];
  const totalPages = queryData?.meta?.totalPages || 1;

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["customer", "orders"] });

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const handleCopy = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const cancelOrderMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: () => {
      toast.success("Đã huỷ đơn hàng");
      refetch();
    },
    onError: () => {
      toast.error("Không thể huỷ đơn hàng. Vui lòng thử lại.");
    },
  });

  const handleCancelConfirm = async () => {
    const { orderId } = cancelModal;
    setCancelModal({ isOpen: false, orderId: "" });
    cancelOrderMutation.mutate(orderId);
  };

  return (
    <div className="w-full px-4 py-6 max-w-2xl md:max-w-4xl lg:max-w-6xl mx-auto space-y-5 pb-24">
      {/* Header: title + voucher button */}
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold text-primary">Lịch sử</h1>
        <button
          id="voucher-modal-trigger-history"
          onClick={openVoucherModal}
          className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 shadow-sm shadow-orange-500/20 px-3.5 py-2.5 rounded-xl hover:scale-105 transition-transform"
        >
          <Gift size={14} />
          <span>Đổi quà {points !== null && `(${points} 🐟)`}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 bg-secondary/30 p-1 rounded-2xl">
        <button
          onClick={() => setActiveTab("orders")}
          className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "orders" ? "bg-card shadow-sm text-primary" : "text-primary/60 hover:text-primary"
          }`}
        >
          Đơn hàng
        </button>
        <button
          onClick={() => setActiveTab("vouchers")}
          className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "vouchers" ? "bg-card shadow-sm text-primary" : "text-primary/60 hover:text-primary"
          }`}
        >
          Lịch sử voucher
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
        >
          {activeTab === "orders" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {isInitialLoading ? (
                [1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded-2xl border bg-card p-4 space-y-3 animate-pulse">
                    <div className="flex justify-between">
                      <div className="h-4 w-32 bg-secondary/60 rounded" />
                      <div className="h-3 w-28 bg-secondary/40 rounded" />
                    </div>
                    <div className="h-8 bg-secondary/30 rounded-xl" />
                    <div className="h-24 bg-secondary/20 rounded-xl" />
                    <div className="h-9 bg-secondary/20 rounded-xl" />
                    <div className="flex justify-end border-t pt-3">
                      <div className="h-5 w-20 bg-primary/10 rounded" />
                    </div>
                  </div>
                ))
              ) : rawOrders.length === 0 ? (
                <div className="text-center py-20 bg-secondary/20 rounded-3xl border border-border/50 md:col-span-2">
                  <div className="text-5xl mb-4">🛒</div>
                  <p className="font-bold text-primary">Bạn chưa có đơn hàng nào</p>
                  <p className="text-sm text-primary/60 mt-1">Hãy đặt thử một ly matcha nhé!</p>
                </div>
              ) : (
                <>
                  {rawOrders.map((order) => {
                    const isOpen = !!expanded[order.id];
                  const isPending = order.status === "PENDING";
                  const isCompleted = order.status === "COMPLETED";
                  const isCancelled = order.status === "CANCELLED";
                  const isTerminal = isCompleted || isCancelled;

                  return (
                    <div
                      key={order.id}
                      className={cn(
                        "rounded-2xl border bg-card shadow-sm overflow-hidden",
                        isPending && "border-yellow-400 border-2 shadow-yellow-50",
                        isCancelled && "opacity-60"
                      )}
                    >
                      <div className="p-4 space-y-3">
                        {/* Row 1: Mã đơn + thời gian */}
                        <div className="flex justify-between items-start">
                          <div className="font-mono font-bold text-sm text-primary">
                            {order.order_code ?? `#${order.id.slice(0, 8)}`}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center mt-0.5">
                            <Clock size={11} className="mr-1" />
                            {formatDate(order.created_at)}
                          </div>
                        </div>

                        {/* Countdown — PENDING only */}
                        {isPending && order.auto_cancel_at && (
                          <div className="flex items-center gap-1.5 text-[11px] bg-yellow-50 border border-yellow-200 px-2.5 py-1 rounded-lg text-yellow-700 w-fit">
                            <Clock size={11} />
                            <span>Tự huỷ sau:</span>
                            <CountdownTimer targetTime={order.auto_cancel_at} className="text-[11px] font-semibold" />
                          </div>
                        )}

                        {/* QR Code — visible khi PENDING */}
                        {isPending && order.payment_qr_url && (
                          <div className="bg-secondary/10 border border-border/50 rounded-xl p-3 space-y-3 mt-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-foreground">Quét QR thanh toán</p>
                              {order.order_code && (
                                <button
                                  onClick={() => handleCopy(order.order_code!, order.id)}
                                  className="flex items-center gap-1 text-[10px] font-medium bg-background border rounded px-1.5 py-0.5 shadow-sm"
                                >
                                  {copiedId === order.id ? (
                                    <><CheckCircle2 size={10} className="text-green-500" /> Đã chép</>
                                  ) : (
                                    <><Copy size={10} /> Chép mã</>
                                  )}
                                </button>
                              )}
                            </div>
                            <div className="flex justify-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={order.payment_qr_url}
                                alt={`QR thanh toán ${order.order_code}`}
                                className="w-40 h-40 rounded-xl border object-contain bg-white"
                              />
                            </div>
                            <div className="text-[11px] text-amber-800 text-center">
                              Nhập đúng mã đơn <span className="font-mono font-bold">{order.order_code}</span> vào lời nhắn.
                            </div>
                          </div>
                        )}

                        {/* Progress Bar — chỉ cho in-progress orders */}
                        {!isTerminal && (
                          <div className="pt-2 pb-1">
                            <OrderProgressBar status={order.status} />
                          </div>
                        )}

                        {/* Completed — points earned timeline style */}
                        {isCompleted && (
                          <div className="flex items-start gap-2.5 pt-1">
                            <div className="mt-0.5 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <Fish size={12} className="text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground">
                                Nhận được <span className="text-primary">+{Math.floor(order.total_vnd / 10000)} điểm 🐟</span>
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                Điểm tích luỹ từ đơn hàng này
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Expand toggle */}
                        <div className="border-t border-border/50 pt-2 mt-2">
                          <button
                            onClick={() => toggle(order.id)}
                            className="w-full flex items-center justify-between text-sm text-foreground/90 font-semibold py-1.5 hover:text-primary transition-colors"
                          >
                            <span>
                              {order.items.reduce((s, i) => s + i.quantity, 0)} món
                            </span>
                            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>

                        {/* Expanded item list */}
                        {isOpen && (
                          <ul className="space-y-3 text-sm text-foreground/90 pb-2">
                            {order.items.map((it, idx) => (
                              <li key={idx} className="flex justify-between gap-3">
                                <div className="flex flex-col min-w-0">
                                  <span className="font-semibold text-[13px]">
                                    {it.menuItem.name}{" "}
                                    <span className="font-normal text-muted-foreground">({it.size})</span>
                                  </span>
                                  <OrderItemDetails item={it} />
                                </div>
                                <span className="font-medium text-foreground shrink-0 mt-0.5 text-[13px]">×{it.quantity}</span>
                              </li>
                            ))}
                            {order.total_voucher_discount_vnd > 0 && (
                              <li className="text-[11px] text-green-600 pt-1 flex flex-col border-t border-border/30">
                                <span>Giảm giá: -{(order.total_voucher_discount_vnd / 1000).toLocaleString("vi-VN")}K</span>
                                {order.discountVouchers && order.discountVouchers.length > 0 && (
                                  <span className="font-medium mt-0.5 truncate block max-w-full" title={order.discountVouchers.map(dv => dv.voucher.package.name).join(", ")}>
                                    (Voucher: {order.discountVouchers.map(dv => dv.voucher.package.name).join(", ")})
                                  </span>
                                )}
                              </li>
                            )}
                          </ul>
                        )}

                        {/* Footer */}
                        <div className="border-t border-border pt-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isPending ? (
                                <button
                                  onClick={() => setCancelModal({ isOpen: true, orderId: order.id })}
                                  className="text-xs font-semibold text-red-500 hover:text-red-700 hover:underline transition-colors"
                                >
                                  Huỷ đơn
                                </button>
                              ) : isTerminal ? (
                                <span className={cn(
                                  "text-[11px] font-semibold flex items-center gap-1",
                                  isCompleted ? "text-primary" : "text-red-500"
                                )}>
                                  {isCompleted ? (
                                    <>
                                      <CheckCircle2 size={12} className="text-primary" />
                                      <span>Đã hoàn thành</span>
                                    </>
                                  ) : (
                                    <>
                                      <XCircle size={12} className="text-red-500" />
                                      <span>Đã huỷ</span>
                                    </>
                                  )}
                                </span>
                              ) : (
                                <span />
                              )}
                            </div>
                            <span className="font-bold text-primary text-base">
                              {(order.grand_total_vnd / 1000).toLocaleString("vi-VN")}K
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  })}
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-2 pt-6 md:col-span-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-lg border bg-card text-sm font-medium hover:bg-secondary/40 disabled:opacity-50 transition"
                      >
                        Trang trước
                      </button>
                      <span className="text-sm font-medium text-muted-foreground px-2">
                        {page} / {totalPages}
                      </span>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className="px-3 py-1.5 rounded-lg border bg-card text-sm font-medium hover:bg-secondary/40 disabled:opacity-50 transition"
                      >
                        Trang sau
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            // ── VOUCHER HISTORY TAB ──
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {vouchersLoading ? (
                [1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded-2xl border bg-card p-4 space-y-2 animate-pulse">
                    <div className="flex gap-3">
                      <div className="w-9 h-9 rounded-full bg-secondary/60 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-24 bg-secondary/50 rounded" />
                        <div className="h-4 w-48 bg-secondary/40 rounded" />
                        <div className="h-3 w-32 bg-secondary/30 rounded" />
                      </div>
                    </div>
                  </div>
                ))
              ) : vouchers.length === 0 ? (
                <div className="text-center py-20 bg-secondary/20 rounded-3xl border border-border/50 md:col-span-2">
                  <Ticket className="w-12 h-12 text-primary/30 mx-auto mb-4" />
                  <p className="font-bold text-primary">Chưa có hoạt động voucher nào</p>
                  <p className="text-sm text-primary/60 mt-1">Những lần đổi và sử dụng voucher sẽ hiện ở đây.</p>
                </div>
              ) : (
                vouchers.map((v) => <VoucherHistoryCard key={v.id} voucher={v} />)
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Cancel Confirm Modal */}
      <ConfirmModal
        isOpen={cancelModal.isOpen}
        title="Huỷ đơn hàng"
        message="Bạn có chắc chắn muốn huỷ đơn này? Hành động này không thể hoàn tác."
        isDestructive={true}
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelModal({ isOpen: false, orderId: "" })}
      />

      <VoucherModal />
    </div>
  );
}
