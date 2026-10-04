"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import { useCustomerPointsHistory } from "@/src/hooks/useCustomerPoints";
import { PointsHistoryTab } from "@/src/components/customer/PointsHistoryTab";

/** Displays the authenticated customer's point history inside the owning voucher frame. */
export function CustomerPointsHistory({ onBack, onClose }: {
  onBack: () => void;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const history = useCustomerPointsHistory(page);
  const reducedMotion = useReducedMotion();

  return (
    <motion.section
      aria-labelledby="wallet-points-history-title"
      initial={{ opacity: 0, x: reducedMotion ? 0 : 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: reducedMotion ? 0 : 16 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 z-10 flex min-h-0 flex-col bg-background"
    >
      <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-border/60 md:hidden" aria-hidden="true" />
      <header className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-3">
        <motion.button type="button" autoFocus onClick={onBack} aria-label="Quay lại danh sách voucher"
          whileTap={{ scale: 0.92 }} transition={{ duration: 0.18 }}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </motion.button>
        <h2 id="wallet-points-history-title" className="flex-1 font-serif text-lg text-primary">Lịch sử điểm</h2>
        <motion.button type="button" onClick={onClose} aria-label="Đóng lịch sử điểm"
          whileTap={{ scale: 0.92 }} transition={{ duration: 0.18 }}
          className="flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-5" aria-hidden="true" />
        </motion.button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <PointsHistoryTab data={history.data} isLoading={history.isPending} isError={history.isError} onPageChange={setPage} />
        {history.isError ? <motion.button type="button" disabled={history.isFetching} onClick={() => void history.refetch()}
          whileTap={{ scale: 0.92 }} transition={{ duration: 0.18 }}
          className="mt-3 min-h-11 w-full rounded-xl border border-border px-4 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
          {history.isFetching ? "Đang tải…" : "Thử lại"}
        </motion.button> : null}
      </div>
    </motion.section>
  );
}
