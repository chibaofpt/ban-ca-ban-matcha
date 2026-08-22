"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import { OrderHistoryCard } from "@/src/components/customer/OrderHistoryCard";
import type {
  CustomerHistoryOrder,
  CustomerHistoryOrderItem,
} from "@/src/lib/types/order";

type OrderFilter = "active" | "cancelled";

interface OrderHistoryTabProps {
  orders: CustomerHistoryOrder[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  filter: OrderFilter;
  onFilterChange: (filter: OrderFilter) => void;
  onPageChange: (page: number) => void;
  onCancel: (orderId: string) => void;
  onReorder: (item: CustomerHistoryOrderItem) => void;
}

const FILTER_OPTIONS: { key: OrderFilter; label: string }[] = [
  { key: "active", label: "Tất cả" },
  { key: "cancelled", label: "Đơn huỷ" },
];

/** Renders the paginated customer order-history tab with server-driven status filter. */
export function OrderHistoryTab({
  orders,
  isLoading,
  page,
  totalPages,
  filter,
  onFilterChange,
  onPageChange,
  onCancel,
  onReorder,
}: OrderHistoryTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Filter bar skeleton */}
        <div className="flex gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <div
              key={opt.key}
              className="h-8 w-20 animate-pulse rounded-full bg-secondary/30"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5" aria-busy="true">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-64 animate-pulse rounded-2xl border bg-card p-4">
              <div className="h-full rounded-xl bg-secondary/20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status filter bar — drives API call via parent */}
      <div role="group" aria-label="Lọc đơn hàng" className="flex gap-2">
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.key;
          return (
            <motion.button
              key={opt.key}
              type="button"
              whileTap={{ scale: 0.93 }}
              transition={{ duration: 0.15 }}
              onClick={() => onFilterChange(opt.key)}
              aria-pressed={active}
              className={`min-h-8 rounded-full px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border/60 bg-card text-primary/60 hover:border-primary/30 hover:text-primary"
              }`}
            >
              {opt.label}
            </motion.button>
          );
        })}
      </div>

      {/* Empty state */}
      {orders.length === 0 ? (
        <div className="rounded-3xl border border-border/50 bg-secondary/20 py-20 text-center">
          <ShoppingBag className="mx-auto mb-4 h-12 w-12 text-primary/30" aria-hidden="true" />
          <p className="font-bold text-primary">
            {filter === "cancelled" ? "Không có đơn nào bị huỷ" : "Bạn chưa có đơn hàng nào"}
          </p>
          {filter === "active" && (
            <p className="mt-1 text-sm text-primary/60">Hãy đặt thử một ly matcha nhé!</p>
          )}
        </div>
      ) : (
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
      )}

      {/* Pagination */}
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
          <span className="px-2 text-sm font-medium text-muted-foreground">
            {page} / {totalPages}
          </span>
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
