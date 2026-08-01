"use client";

import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Fish,
  Gift,
  Loader2,
  RotateCcw,
} from "lucide-react";
import type {
  CustomerPointsData,
  PointsHistoryEvent,
} from "@/src/lib/types/points";

interface PointsHistoryTabProps {
  data: CustomerPointsData | undefined;
  isLoading: boolean;
  isError: boolean;
  onPageChange: (page: number) => void;
}

function formatPoints(value: number): string {
  return `${value > 0 ? "+" : ""}${value} điểm`;
}

function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getOtherTitle(event: PointsHistoryEvent): string {
  const packageName = event.voucher?.package_name;
  const labels: Record<string, string> = {
    voucher_purchase: `Đổi voucher: ${packageName ?? "Voucher"}`,
    voucher_refund: `Hoàn điểm voucher: ${packageName ?? "Voucher"}`,
    manual_admin_adjustment: "Điều chỉnh bởi quản trị viên",
    registration_bonus: "Điểm chào mừng",
    reversed_by_admin: "Hoàn tác điều chỉnh điểm",
  };
  if (labels[event.reason]) return labels[event.reason];
  if (event.total_delta > 0) return "Cộng điểm bởi hệ thống";
  if (event.total_delta < 0) return "Trừ điểm bởi hệ thống";
  return "Thay đổi điểm";
}

function getEventTitle(event: PointsHistoryEvent): string {
  if (event.kind === "order_reversal") return "Điều chỉnh điểm đơn hàng";
  if (event.kind === "order_reward") {
    return event.order?.order_code
      ? `Cộng từ đơn hàng ${event.order.order_code}`
      : "Cộng từ đơn hàng tại quầy";
  }
  return getOtherTitle(event);
}

function getActorLabel(event: PointsHistoryEvent): string | null {
  if (!event.actor) return null;
  if (event.actor.role === "ADMIN") {
    return `Thực hiện bởi Admin ${event.actor.name}`;
  }
  if (event.actor.role === "STAFF") {
    return `Thực hiện bởi Nhân viên ${event.actor.name}`;
  }
  return null;
}

function PointsEventCard({ event }: { event: PointsHistoryEvent }) {
  const isOrderEvent = event.kind !== "other";
  const actorLabel = getActorLabel(event);
  const EventIcon =
    event.kind === "order_reversal"
      ? RotateCcw
      : event.reason === "voucher_purchase" || event.reason === "voucher_refund"
        ? Gift
        : Fish;

  return (
    <motion.li
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <EventIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-primary">{getEventTitle(event)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatEventDate(event.created_at)}
              </p>
            </div>
            <span
              className={`shrink-0 text-base font-bold ${
                event.total_delta >= 0 ? "text-amber-700" : "text-red-600"
              }`}
            >
              {formatPoints(event.total_delta)}
            </span>
          </div>

          {event.order && (
            <p className="mt-2 text-xs text-muted-foreground">
              Giá trị tính điểm: {event.order.points_base_vnd.toLocaleString("vi-VN")}đ
            </p>
          )}
          {actorLabel && (
            <p className="mt-1 text-xs text-muted-foreground">{actorLabel}</p>
          )}

          {isOrderEvent && (
            <div className="mt-3 space-y-1.5 border-t border-dashed border-border pt-3 text-xs text-muted-foreground">
              {event.order_points !== 0 && (
                <div className="flex justify-between gap-3">
                  <span>Điểm mua hàng</span>
                  <span className="font-semibold">{formatPoints(event.order_points)}</span>
                </div>
              )}
              {event.surplus_points !== 0 && (
                <div className="flex justify-between gap-3">
                  <span>Điểm dư từ voucher</span>
                  <span className="font-semibold">{formatPoints(event.surplus_points)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.li>
  );
}

/** Renders the balance and paginated grouped point events for customer history. */
export function PointsHistoryTab({
  data,
  isLoading,
  isError,
  onPageChange,
}: PointsHistoryTabProps) {
  if (isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center" aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Đang tải lịch sử điểm</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="rounded-2xl bg-red-50 p-4 text-center text-sm text-red-700">
        Chưa thể tải lịch sử điểm. Vui lòng thử lại.
      </p>
    );
  }

  return (
    <section aria-labelledby="points-balance-title" className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <p id="points-balance-title" className="text-sm">
          Số dư hiện tại: <strong>{data.points_balance} điểm 🐟</strong>
        </p>
      </div>

      {data.events.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Bạn chưa có giao dịch điểm nào.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          {data.events.map((event) => (
            <PointsEventCard key={event.id} event={event} />
          ))}
        </ul>
      )}

      {data.meta.totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2 pt-2" aria-label="Phân trang điểm">
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.18 }}
            disabled={data.meta.page <= 1}
            onClick={() => onPageChange(Math.max(1, data.meta.page - 1))}
            className="flex min-h-11 items-center gap-1 rounded-xl border bg-card px-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Trang trước
          </motion.button>
          <span className="px-2 text-sm text-muted-foreground">
            {data.meta.page} / {data.meta.totalPages}
          </span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.18 }}
            disabled={data.meta.page >= data.meta.totalPages}
            onClick={() => onPageChange(data.meta.page + 1)}
            className="flex min-h-11 items-center gap-1 rounded-xl border bg-card px-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            Trang sau
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </motion.button>
        </nav>
      )}
    </section>
  );
}
