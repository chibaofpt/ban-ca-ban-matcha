"use client";

import { useMemo, useState } from "react";
import { Drawer } from "vaul";
import {
  ChevronLeft,
  ChevronRight,
  Fish,
  History,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { useCustomerPointsHistory } from "@/src/hooks/useCustomerPoints";
import {
  groupPointsLogs,
  type PointsHistoryGroup,
} from "@/src/utils/customerUx";

function formatPoints(value: number): string {
  return `${value > 0 ? "+" : ""}${value} điểm`;
}

function getOtherReasonLabel(group: PointsHistoryGroup): string {
  const reason = group.logs[0]?.reason;
  const labels: Record<string, string> = {
    registration_bonus: "Điểm chào mừng",
    voucher_purchase: "Đổi điểm lấy voucher",
    voucher_refund: "Hoàn điểm voucher",
    manual_admin_adjustment: "Điều chỉnh bởi quản trị viên",
    reversed_by_admin: "Đảo điểm bởi quản trị viên",
  };
  return labels[reason] ?? "Thay đổi điểm";
}

function PointsEvent({ group }: { group: PointsHistoryGroup }) {
  const isReward = group.kind === "order_reward";
  const isReversal = group.kind === "order_reversal";
  const title = isReward
    ? "Điểm từ đơn đã hoàn tất"
    : isReversal
      ? "Điểm đơn hàng được điều chỉnh"
      : getOtherReasonLabel(group);

  return (
    <li className="rounded-2xl border border-border bg-white p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            group.totalDelta >= 0
              ? "bg-amber-50 text-amber-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {isReversal ? <RotateCcw className="h-5 w-5" /> : <Fish className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-primary">{title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Intl.DateTimeFormat("vi-VN", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(group.createdAt))}
              </p>
            </div>
            <span
              className={`shrink-0 text-base font-bold ${
                group.totalDelta >= 0 ? "text-amber-700" : "text-red-600"
              }`}
            >
              {formatPoints(group.totalDelta)}
            </span>
          </div>

          {(isReward || isReversal) && (
            <div className="mt-3 space-y-1.5 border-t border-dashed border-border pt-3 text-xs">
              <div className="flex justify-between gap-3 text-muted-foreground">
                <span>Điểm mua hàng</span>
                <span className="font-semibold">{formatPoints(group.orderPoints)}</span>
              </div>
              {group.surplusPoints !== 0 && (
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>Điểm dư từ voucher</span>
                  <span className="font-semibold">
                    {formatPoints(group.surplusPoints)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Opens a Vaul sheet containing the current customer's grouped points history. */
export function ProfilePointsHistory() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useCustomerPointsHistory(page);
  const groups = useMemo(() => groupPointsLogs(data?.logs ?? []), [data?.logs]);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-between rounded-xl p-3 text-left transition-colors hover:bg-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex items-center gap-3 text-primary">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <History size={20} />
            </span>
            <span className="text-[15px] font-medium">Lịch sử điểm</span>
          </span>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>
      </Drawer.Trigger>

      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[140] bg-black/45" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[141] mx-auto flex max-h-[88dvh] max-w-lg flex-col rounded-t-[2rem] bg-[#fdfcf7] shadow-2xl outline-none">
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-primary/20" />
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 pb-4 pt-3">
            <div>
              <Drawer.Title className="font-serif text-xl font-bold text-primary">
                Lịch sử điểm
              </Drawer.Title>
              <Drawer.Description className="mt-1 text-sm text-primary/65">
                Số dư hiện tại: <strong>{data?.points_balance ?? "—"} điểm</strong>
              </Drawer.Description>
            </div>
            <Drawer.Close className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <X className="h-5 w-5" />
              <span className="sr-only">Đóng</span>
            </Drawer.Close>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {isLoading && (
              <div className="flex min-h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            {isError && (
              <p className="rounded-2xl bg-red-50 p-4 text-center text-sm text-red-700">
                Chưa thể tải lịch sử điểm. Vui lòng thử lại.
              </p>
            )}
            {!isLoading && !isError && groups.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Bạn chưa có giao dịch điểm nào.
              </p>
            )}
            {groups.length > 0 && (
              <ul className="space-y-3">
                {groups.map((group) => (
                  <PointsEvent key={group.id} group={group} />
                ))}
              </ul>
            )}
          </div>

          {(data?.meta.totalPages ?? 1) > 1 && (
            <div className="flex items-center justify-between border-t border-border/60 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-primary disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Trước
              </button>
              <span className="text-xs text-muted-foreground">
                Trang {page}/{data?.meta.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= (data?.meta.totalPages ?? 1)}
                onClick={() => setPage((current) => current + 1)}
                className="flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-primary disabled:opacity-40"
              >
                Sau
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
