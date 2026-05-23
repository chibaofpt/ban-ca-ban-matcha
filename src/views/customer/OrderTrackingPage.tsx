"use client";

import { useOrderTracking } from "@/src/lib/hooks/useOrderTracking";
import { CountdownTimer } from "@/src/components/customer/CountdownTimer";
import { OrderStatusTimeline } from "@/src/components/customer/OrderStatusTimeline";
import { Copy, CheckCircle2, Clock, Fish } from "lucide-react";
import { useState } from "react";
import { cn } from "@/src/utils/cn";
import type { OrderStatus } from "@/src/lib/types/order";

const STATUS_LABELS: Record<OrderStatus, { title: string; subtitle: string; emoji: string }> = {
  PENDING: {
    title: "Chờ xác nhận thanh toán",
    subtitle: "Chuyển khoản và gửi nội dung mã đơn để xác nhận",
    emoji: "⏳",
  },
  ADMIN_CONFIRMED: {
    title: "Đã xác nhận thanh toán",
    subtitle: "Nhân viên đang chuẩn bị đơn của bạn...",
    emoji: "✅",
  },
  STAFF_DONE: {
    title: "Đơn hàng đã sẵn sàng!",
    subtitle: "Vui lòng đến quầy để lấy đồ uống",
    emoji: "🎉",
  },
  COMPLETED: {
    title: "Hoàn thành!",
    subtitle: "Cảm ơn bạn đã ủng hộ Bánh Cá Bốn Mùa 🐟",
    emoji: "✨",
  },
  CANCELLED: {
    title: "Đơn hàng đã bị huỷ",
    subtitle: "Đơn hàng đã hết thời gian hoặc bị admin huỷ",
    emoji: "❌",
  },
};

function formatVND(vnd: number): string {
  return (vnd / 1000).toLocaleString("vi-VN") + "K";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

interface OrderTrackingPageProps {
  orderId: string;
}

/** Customer order tracking view. Polls order status and shows appropriate UI per status. */
export default function OrderTrackingPage({ orderId }: OrderTrackingPageProps) {
  const { order, loading, error } = useOrderTracking(orderId);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!order?.order_code) return;
    await navigator.clipboard.writeText(order.order_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading && !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Đang tải thông tin đơn hàng...</p>
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-4xl">😕</p>
          <p className="font-semibold text-foreground">Không thể tải đơn hàng</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const statusInfo = STATUS_LABELS[order.status];
  const isPending = order.status === "PENDING";
  const isCompleted = order.status === "COMPLETED";
  const isCancelled = order.status === "CANCELLED";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5 pb-24">

        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-4xl">{statusInfo.emoji}</p>
          <h1 className="font-serif text-2xl font-bold text-foreground">{statusInfo.title}</h1>
          <p className="text-sm text-muted-foreground">{statusInfo.subtitle}</p>
        </div>

        {/* Order code + copy */}
        {order.order_code && (
          <div className="flex items-center justify-between bg-secondary/40 rounded-2xl px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Mã đơn hàng</p>
              <p className="font-mono text-lg font-bold text-foreground tracking-widest">
                {order.order_code}
              </p>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs font-medium bg-card border rounded-xl px-3 py-2 hover:bg-secondary/60 transition active:scale-95"
              id="copy-order-code-btn"
            >
              {copied ? (
                <><CheckCircle2 size={14} className="text-green-500" /> Đã sao chép</>
              ) : (
                <><Copy size={14} /> Sao chép</>
              )}
            </button>
          </div>
        )}

        {/* VietQR Payment section — only when PENDING */}
        {isPending && order.payment_qr_url && (
          <div className="space-y-3">
            <div className="bg-card border rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Quét QR để thanh toán</p>
                {order.auto_cancel_at && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock size={12} />
                    <span>Còn lại </span>
                    <CountdownTimer targetTime={order.auto_cancel_at} />
                  </div>
                )}
              </div>

              {/* QR Image */}
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={order.payment_qr_url}
                  alt={`QR thanh toán ${order.order_code}`}
                  className="w-56 h-56 rounded-xl border object-contain bg-white"
                />
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                <p className="font-semibold">Nội dung chuyển khoản:</p>
                <p className="font-mono text-base font-bold">{order.order_code}</p>
                <p className="text-amber-700 dark:text-amber-300">
                  Nhập đúng mã đơn trong ô ghi chú ngân hàng để xác nhận thanh toán.
                </p>
              </div>
            </div>

            {/* Total amount */}
            <div className="bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Số tiền cần chuyển</span>
              <span className="text-xl font-bold text-primary">{formatVND(order.total_vnd)}</span>
            </div>
          </div>
        )}

        {/* Completed — show points */}
        {isCompleted && (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl p-4 flex items-center gap-3">
            <Fish size={28} className="text-primary shrink-0" />
            <div>
              <p className="text-sm text-muted-foreground">Điểm tích luỹ nhận được</p>
              <p className="text-xl font-bold text-foreground">
                +{Math.floor(order.total_vnd / 10000)} 🐟
              </p>
            </div>
          </div>
        )}

        {/* Cancelled reason */}
        {isCancelled && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-2xl p-4 text-sm text-red-700 dark:text-red-300 space-y-1">
            <p className="font-semibold">Lý do có thể:</p>
            <ul className="list-disc list-inside space-y-0.5 text-red-600 dark:text-red-400">
              <li>Quá 20 phút chưa có chuyển khoản</li>
              <li>Admin đã huỷ đơn hàng</li>
            </ul>
            {order.voucher_id && (
              <p className="text-green-600 dark:text-green-400 font-medium mt-2">
                ✅ Voucher của bạn đã được hoàn lại
              </p>
            )}
          </div>
        )}

        {/* Pickup time */}
        {order.pickup_time && !isCancelled && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/30 rounded-xl px-4 py-2.5">
            <Clock size={14} className="shrink-0" />
            <span>Thời gian lấy đồ: <strong className="text-foreground">{formatTime(order.pickup_time)}</strong></span>
          </div>
        )}

        {/* Status timeline */}
        <div className={cn("bg-card border rounded-2xl p-4", isCancelled && "opacity-70")}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Tiến trình đơn hàng
          </p>
          <OrderStatusTimeline status={order.status} />
        </div>

        {/* Order summary */}
        <div className="bg-card border rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chi tiết đơn</p>
          <ul className="space-y-2">
            {order.items.map((item, idx) => (
              <li key={idx} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">{item.menuItem.name}</span>
                  <span className="text-muted-foreground"> ({item.size})</span>
                  {item.addons.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      + {item.addons.map((a) => a.addonOption.label).join(", ")}
                    </p>
                  )}
                </div>
                <span className="text-muted-foreground shrink-0">×{item.quantity}</span>
              </li>
            ))}
          </ul>
          <div className="border-t pt-3 space-y-1.5 text-sm">
            {order.discount_vnd > 0 && (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tạm tính</span>
                  <span>{formatVND(order.subtotal_vnd)}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Giảm giá</span>
                  <span>-{formatVND(order.discount_vnd)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-foreground text-base">
              <span>Tổng cộng</span>
              <span>{formatVND(order.total_vnd)}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
