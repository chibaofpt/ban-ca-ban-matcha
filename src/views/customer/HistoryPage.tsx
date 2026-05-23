"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiClient } from "@/src/lib/api/client";
import { cancelOrder } from "@/src/services/orderService";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Clock, Copy, CheckCircle2, Ticket, Fish } from "lucide-react";
import { cn } from "@/src/utils/cn";
import { CountdownTimer } from "@/src/components/customer/CountdownTimer";
import { OrderProgressBar } from "@/src/components/shared/OrderProgressBar";
import { OrderItemDetails } from "@/src/components/shared/OrderItemDetails";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import type { OrderStatus } from "@/src/lib/types/order";

interface CustomerHistoryOrder {
  id: string;
  order_code: string | null;
  status: OrderStatus;
  order_type: string;
  total_vnd: number;
  subtotal_vnd: number;
  discount_vnd: number;
  created_at: string;
  auto_cancel_at: string | null;
  payment_qr_url: string | null;
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

/** Page lịch sử đơn hàng và voucher của khách hàng. */
export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<"orders" | "vouchers">("orders");
  const [orders, setOrders] = useState<CustomerHistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<{
    isOpen: boolean;
    orderId: string;
  }>({ isOpen: false, orderId: "" });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/orders");
      setOrders(res.data.data);
    } catch {
      toast.error("Không thể tải lịch sử đơn hàng");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "orders") return;
    fetchOrders();
  }, [activeTab, fetchOrders]);

  // Poll every 15s if there are PENDING orders
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const hasPending = orders.some((o) => o.status === "PENDING");
    if (hasPending) {
      intervalRef.current = setInterval(fetchOrders, 15000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [orders, fetchOrders]);

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const handleCopy = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCancelConfirm = async () => {
    const { orderId } = cancelModal;
    setCancelModal({ isOpen: false, orderId: "" });
    try {
      await cancelOrder(orderId);
      toast.success("Đã huỷ đơn hàng");
      await fetchOrders();
    } catch {
      toast.error("Không thể huỷ đơn hàng. Vui lòng thử lại.");
    }
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-5 pb-24">
      <h1 className="font-serif text-3xl font-bold text-primary">Lịch sử của tôi</h1>

      {/* Tabs */}
      <div className="flex bg-secondary/30 p-1 rounded-2xl">
        <button
          onClick={() => setActiveTab("orders")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "orders" ? "bg-white shadow-sm text-primary" : "text-primary/60 hover:text-primary"
          }`}
        >
          Đơn hàng
        </button>
        <button
          onClick={() => setActiveTab("vouchers")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "vouchers" ? "bg-white shadow-sm text-primary" : "text-primary/60 hover:text-primary"
          }`}
        >
          Voucher
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
            <div className="space-y-4">
              {loading ? (
                [1, 2, 3].map((i) => (
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
              ) : orders.length === 0 ? (
                <div className="text-center py-20 bg-secondary/20 rounded-3xl border border-border/50">
                  <div className="text-5xl mb-4">🛒</div>
                  <p className="font-bold text-primary">Bạn chưa có đơn hàng nào</p>
                  <p className="text-sm text-primary/60 mt-1">Hãy đặt thử một ly matcha nhé!</p>
                </div>
              ) : (
                orders.map((order) => {
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
                          <div className="text-xs text-muted-foreground">
                            <Clock size={12} className="inline mr-1" />
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
                          <div className="bg-white border border-border rounded-2xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-foreground">Quét QR để thanh toán</p>
                              {order.order_code && (
                                <button
                                  onClick={() => handleCopy(order.order_code!, order.id)}
                                  className="flex items-center gap-1 text-[11px] font-medium bg-secondary/50 border rounded-lg px-2 py-1 hover:bg-secondary transition-colors"
                                >
                                  {copiedId === order.id ? (
                                    <><CheckCircle2 size={11} className="text-green-500" /> Đã sao chép</>
                                  ) : (
                                    <><Copy size={11} /> {order.order_code}</>
                                  )}
                                </button>
                              )}
                            </div>
                            <div className="flex justify-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={order.payment_qr_url}
                                alt={`QR thanh toán ${order.order_code}`}
                                className="w-48 h-48 rounded-xl border object-contain"
                              />
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-800 space-y-0.5">
                              <p className="font-semibold">Nội dung chuyển khoản:</p>
                              <p className="font-mono font-bold text-sm">{order.order_code}</p>
                              <p>Nhập đúng mã đơn trong ô ghi chú để xác nhận thanh toán.</p>
                            </div>
                          </div>
                        )}

                        {/* Progress Bar — chỉ cho in-progress orders */}
                        {!isTerminal && (
                          <div className="pt-1">
                            <OrderProgressBar status={order.status} />
                          </div>
                        )}

                        {/* Completed — points earned */}
                        {isCompleted && (
                          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
                            <Fish size={22} className="text-primary shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Điểm tích luỹ nhận được</p>
                              <p className="font-bold text-foreground">
                                +{Math.floor(order.total_vnd / 10000)} 🐟
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Expand toggle */}
                        <button
                          onClick={() => toggle(order.id)}
                          className="w-full flex items-center justify-between text-sm text-foreground/80 hover:text-foreground bg-secondary/20 p-2 rounded-xl"
                        >
                          <span className="font-medium">
                            {order.items.reduce((s, i) => s + i.quantity, 0)} món
                          </span>
                          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>

                        {/* Expanded item list */}
                        {isOpen && (
                          <ul className="space-y-3 text-sm text-foreground/90 pt-1">
                            {order.items.map((it, idx) => (
                              <li key={idx} className="flex justify-between gap-3">
                                <div className="flex flex-col min-w-0">
                                  <span className="font-semibold">
                                    {it.menuItem.name}{" "}
                                    <span className="font-normal text-muted-foreground">({it.size})</span>
                                  </span>
                                  <OrderItemDetails item={it} />
                                </div>
                                <span className="font-medium text-foreground shrink-0 mt-0.5">×{it.quantity}</span>
                              </li>
                            ))}
                            {order.discount_vnd > 0 && (
                              <li className="text-xs text-green-600 pt-1">
                                Giảm giá: -{(order.discount_vnd / 1000).toLocaleString("vi-VN")}K
                              </li>
                            )}
                          </ul>
                        )}

                        {/* Footer */}
                        <div className="border-t border-border pt-3">
                          <div className="flex justify-end">
                            <span className="font-bold text-primary text-base">
                              {(order.total_vnd / 1000).toLocaleString("vi-VN")}K
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            {isPending ? (
                              <button
                                onClick={() => setCancelModal({ isOpen: true, orderId: order.id })}
                                className="text-xs font-semibold text-red-500 hover:text-red-700 hover:underline transition-colors"
                              >
                                Huỷ đơn
                              </button>
                            ) : isTerminal ? (
                              <span className={cn(
                                "text-xs font-semibold",
                                isCompleted ? "text-green-600" : "text-red-500"
                              )}>
                                {isCompleted ? "✅ Đã hoàn thành" : "❌ Đã huỷ"}
                              </span>
                            ) : (
                              <span />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="text-center py-24 bg-secondary/20 rounded-3xl border border-border/50 flex flex-col items-center justify-center">
              <Ticket className="w-12 h-12 text-primary/30 mb-4" />
              <p className="font-bold text-primary text-lg">Tính năng đang phát triển</p>
              <p className="text-sm text-primary/60 mt-1 max-w-[250px]">
                Tính năng theo dõi voucher đã đổi sẽ sớm ra mắt trong Phase 4!
              </p>
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
    </div>
  );
}
