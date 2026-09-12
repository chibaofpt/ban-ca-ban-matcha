"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";
import { listMyVoucherPage, type MyVoucher } from "@/src/services/customerVoucherService";
import { filterHistoryVouchers } from "@/src/lib/utils/voucherModalHelpers";
import { VoucherHistorySection } from "@/src/components/shared/VoucherModalSections";

/** Load customer voucher history on demand without adding it to the active checkout wallet. */
export function CustomerVoucherHistory({ onVoucherClick }: {
  onVoucherClick: (voucher: MyVoucher) => void;
}) {
  const history = useInfiniteQuery({
    queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHER_HISTORY,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listMyVoucherPage({ statuses: ["REDEEMED", "EXPIRED"], cursor: pageParam }),
    getNextPageParam: (page) => page.meta?.has_more ? page.meta.next_cursor ?? undefined : undefined,
    staleTime: 5 * 60 * 1000,
  });
  const vouchers = filterHistoryVouchers([...new Map(
    (history.data?.pages.flatMap((page) => page.data) ?? []).map((voucher) => [voucher.qr_token, voucher]),
  ).values()]);

  if (history.isPending) {
    return <p role="status" className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Đang tải lịch sử…
    </p>;
  }

  return <div className="space-y-3" aria-busy={history.isFetching}>
    {history.data ? (
      vouchers.length === 0 && history.hasNextPage
        ? <p className="text-center text-sm text-muted-foreground">Chưa thấy voucher lịch sử. Bạn có thể xem thêm bên dưới.</p>
        : <VoucherHistorySection vouchers={vouchers} onVoucherClick={onVoucherClick} />
    ) : null}
    {history.isError ? <p role="alert" className="text-center text-sm text-destructive">
      Không thể tải lịch sử voucher. Vui lòng thử lại.
    </p> : null}
    {history.hasNextPage || history.isError ? <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.15 }}
      disabled={history.isFetching}
      onClick={() => { void (history.isError && !history.isFetchNextPageError ? history.refetch() : history.fetchNextPage()); }}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {history.isFetching ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {history.isFetching ? "Đang tải…" : history.isError ? "Thử lại" : "Xem thêm"}
    </motion.button> : null}
  </div>;
}
