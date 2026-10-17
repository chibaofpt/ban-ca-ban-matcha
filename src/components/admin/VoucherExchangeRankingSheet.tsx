"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";
import {
  fetchVoucherExchangeRanking,
  type AdminVoucherExchangePeriod,
  type AdminVoucherExchangeRankingItem,
} from "@/src/services/adminVoucherService";
import { cn } from "@/src/utils/cn";

const PERIOD_OPTIONS: ReadonlyArray<{ value: AdminVoucherExchangePeriod; label: string }> = [
  { value: "year", label: "Năm" },
  { value: "month", label: "Tháng" },
  { value: "week", label: "Tuần" },
  { value: "day", label: "Ngày" },
];

const PERIOD_LABEL: Record<AdminVoucherExchangePeriod, string> = {
  year: "năm nay",
  month: "tháng này",
  week: "tuần này",
  day: "hôm nay",
};

const MEDAL_BACKGROUND = ["bg-medal-gold", "bg-medal-silver", "bg-medal-bronze"] as const;

function rankPalette(rank: number): { background: string; number: string; content: string } {
  if (rank <= 3) {
    return { background: MEDAL_BACKGROUND[rank - 1], number: "text-primary", content: "text-foreground" };
  }
  return { background: "bg-primary", number: "text-primary-foreground", content: "text-primary-foreground" };
}

/** Bottom sheet ranking voucher packages by point-exchange vouchers in one Vietnam period. */
export function VoucherExchangeRankingSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [period, setPeriod] = useState<AdminVoucherExchangePeriod>("year");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPeriod("year");
  }
  const ranking = useQuery({
    queryKey: VOUCHER_QUERY_KEYS.ADMIN_VOUCHER_EXCHANGE_RANKING(period),
    queryFn: () => fetchVoucherExchangeRanking(period),
    enabled: open,
  });
  const items = ranking.data?.items ?? [];

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Xếp hạng lượt đổi"
      description="Số lượt khách dùng điểm đổi voucher theo mốc đang chọn."
    >
      <div className="space-y-4">
        <div role="group" aria-label="Mốc thời gian" className="grid grid-cols-4 gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={period === option.value}
              onClick={() => setPeriod(option.value)}
              className={cn(
                "h-11 rounded-xl border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                period === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {ranking.isPending ? (
          <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Đang tải…
          </p>
        ) : ranking.isError ? (
          <div className="grid place-items-center gap-3 py-10 text-center">
            <p role="alert" className="text-sm text-destructive">Chưa thể tải xếp hạng.</p>
            <Button type="button" variant="outline" onClick={() => void ranking.refetch()}>Thử lại</Button>
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Chưa có lượt đổi nào {PERIOD_LABEL[period]}.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="pr-1 text-right text-xs font-medium text-muted-foreground">Lượt đổi</p>
            {items.map((item, index) => <RankingRow key={item.id} rank={index + 1} item={item} />)}
          </div>
        )}
      </div>
    </ResponsiveOverlay>
  );
}

function RankingRow({ rank, item }: { rank: number; item: AdminVoucherExchangeRankingItem }) {
  const palette = rankPalette(rank);
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-3 rounded-2xl px-3 py-2.5",
        palette.background,
        palette.content,
      )}
    >
      <span className={cn("text-xl font-bold tabular-nums", palette.number)}>
        <span className="sr-only">Hạng </span>{rank}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</p>
          <span className={cn("shrink-0 text-xl font-bold tabular-nums", palette.number)}>
            <span className="sr-only">Lượt đổi: </span>{item.exchange_count}
          </span>
        </div>
        {item.description ? <p className="mt-0.5 line-clamp-2 text-xs">{item.description}</p> : null}
      </div>
    </div>
  );
}
