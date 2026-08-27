"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Fish,
  XCircle,
} from "lucide-react";
import { CountdownTimer } from "@/src/components/customer/CountdownTimer";
import { OrderDetailSheet } from "@/src/components/customer/OrderDetailSheet";
import { OrderHistoryItems } from "@/src/components/customer/OrderHistoryItems";
import { OrderProgressBar } from "@/src/components/shared/OrderProgressBar";
import { PaymentQrPanel } from "@/src/components/shared/PaymentQrPanel";
import type {
  CustomerHistoryOrder,
  CustomerHistoryOrderItem,
} from "@/src/lib/types/order";
import { groupOrderItems } from "@/src/utils/orderHelpers";
import { cn } from "@/src/utils/cn";
import { formatKa } from "@/src/utils/display";

interface OrderHistoryCardProps {
  order: CustomerHistoryOrder;
  onCancel: (orderId: string) => void;
  onReorder: (item: CustomerHistoryOrderItem) => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())} • ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

const MAX_INLINE_ITEMS = 3;

/** Renders one customer order with tracking, payment and reorder controls. */
export function OrderHistoryCard({
  order,
  onCancel,
  onReorder,
}: OrderHistoryCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const isPending = order.status === "PENDING";
  const isCompleted = order.status === "COMPLETED";
  const isCancelled = order.status === "CANCELLED";
  const isTerminal = isCompleted || isCancelled;

  const groupedItems = groupOrderItems(order.items);
  const hasMore = groupedItems.length > MAX_INLINE_ITEMS;
  const hiddenCount = groupedItems.length - MAX_INLINE_ITEMS;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-sm",
        isPending && "border-2 border-yellow-400 shadow-yellow-50",
        isCancelled && "opacity-60",
      )}
    >
      <div className="space-y-3 p-4">
        {/* Order code + date */}
        <div className="flex items-start justify-between gap-3">
          <span className="font-mono text-sm font-bold text-primary">
            {order.order_code ?? `#${order.id.slice(0, 8)}`}
          </span>
          <span className="mt-0.5 flex items-center text-[11px] text-muted-foreground">
            <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
            {formatDate(order.created_at)}
          </span>
        </div>

        {/* Auto-cancel countdown */}
        {isPending && order.auto_cancel_at && (
          <div className="flex w-fit items-center gap-1.5 rounded-lg border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-[11px] text-yellow-700">
            <Clock className="h-3 w-3" aria-hidden="true" />
            <span>Tự huỷ sau:</span>
            <CountdownTimer targetTime={order.auto_cancel_at} className="text-[11px] font-semibold" />
          </div>
        )}

        {/* Payment QR */}
        {isPending && order.payment_qr_url && order.order_code && (
          <PaymentQrPanel
            qrUrl={order.payment_qr_url}
            orderCode={order.order_code}
            amountVnd={order.grand_total_vnd}
          />
        )}

        {/* Progress bar */}
        {!isTerminal && <OrderProgressBar status={order.status} />}

        {/* Points earned */}
        {isCompleted && (
          <div className="flex items-start gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Fish className="h-3 w-3 text-primary" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold">
                Nhận được{" "}
                <span className="text-primary">
                  +{Math.floor(order.total_vnd / 10_000)} điểm 🐟
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Điểm tích luỹ từ đơn hàng này
              </p>
            </div>
          </div>
        )}

        {/* Items preview — always visible, max 3 rows */}
        <div className="border-t border-border/50 pt-2">
          <OrderHistoryItems
            order={order}
            canReorder={isTerminal}
            onReorder={onReorder}
            maxItems={MAX_INLINE_ITEMS}
          />

          {/* "Xem thêm" → opens bottom sheet */}
          {hasMore && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              onClick={() => setDetailOpen(true)}
              className="mt-1 flex min-h-9 w-full items-center justify-center gap-1 rounded-xl border border-border/60 bg-secondary/30 text-[12px] font-semibold text-primary/70 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Xem thêm {hiddenCount} món khác
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </motion.button>
          )}
        </div>

        {/* Footer: cancel / status + total */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          {isPending ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.18 }}
              onClick={() => onCancel(order.id)}
              className="min-h-11 rounded-lg px-2 text-xs font-semibold text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Huỷ đơn
            </motion.button>
          ) : isTerminal ? (
            <span
              className={cn(
                "flex items-center gap-1 text-[11px] font-semibold",
                isCompleted ? "text-primary" : "text-red-600",
              )}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {isCompleted ? "Đã hoàn thành" : "Đã huỷ"}
            </span>
          ) : (
            <span />
          )}
          <span className="text-base font-bold text-primary">
            {formatKa(order.grand_total_vnd, "ceil")}
          </span>
        </div>
      </div>

      {/* Full-order bottom sheet (vaul) */}
      <OrderDetailSheet
        isOpen={detailOpen}
        order={order}
        canReorder={isTerminal}
        onReorder={onReorder}
        onClose={() => setDetailOpen(false)}
      />
    </article>
  );
}
