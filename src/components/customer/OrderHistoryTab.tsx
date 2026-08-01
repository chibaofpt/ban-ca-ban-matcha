"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import { OrderHistoryCard } from "@/src/components/customer/OrderHistoryCard";
import type {
  CustomerHistoryOrder,
  CustomerHistoryOrderItem,
} from "@/src/lib/types/order";

interface OrderHistoryTabProps {
  orders: CustomerHistoryOrder[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onCancel: (orderId: string) => void;
  onReorder: (item: CustomerHistoryOrderItem) => void;
}

/** Renders the paginated customer order-history tab. */
export function OrderHistoryTab({
  orders,
  isLoading,
  page,
  totalPages,
  onPageChange,
  onCancel,
  onReorder,
}: OrderHistoryTabProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5" aria-busy="true">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-64 animate-pulse rounded-2xl border bg-card p-4">
            <div className="h-full rounded-xl bg-secondary/20" />
          </div>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-3xl border border-border/50 bg-secondary/20 py-20 text-center">
        <ShoppingBag className="mx-auto mb-4 h-12 w-12 text-primary/30" aria-hidden="true" />
        <p className="font-bold text-primary">Bạn chưa có đơn hàng nào</p>
        <p className="mt-1 text-sm text-primary/60">Hãy đặt thử một ly matcha nhé!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        {orders.map((order) => (
          <OrderHistoryCard
            key={order.id}
            order={order}
            onCancel={onCancel}
            onReorder={onReorder}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="Phân trang đơn hàng">
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.18 }}
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="flex min-h-11 items-center gap-1 rounded-xl border bg-card px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Trang trước
          </motion.button>
          <span className="px-2 text-sm font-medium text-muted-foreground">{page} / {totalPages}</span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.18 }}
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className="flex min-h-11 items-center gap-1 rounded-xl border bg-card px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            Trang sau
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </motion.button>
        </nav>
      )}
    </div>
  );
}
