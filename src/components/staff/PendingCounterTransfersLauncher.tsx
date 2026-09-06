"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, QrCode, X } from "lucide-react";
import { motion } from "framer-motion";
import { Drawer } from "vaul";
import { CountdownTimer } from "@/src/components/customer/CountdownTimer";
import type { StaffOrderResult } from "@/src/lib/types/order";
import { getPendingTransferLaunchMode } from "@/src/lib/utils/counterTransferOrder";
import { formatKa } from "@/src/utils/display";

interface PendingCounterTransfersLauncherProps {
  payments: StaffOrderResult[];
  onSelect: (payment: StaffOrderResult) => void;
}

/** Open one pending QR directly or present a bottom-sheet picker for multiple orders. */
export function PendingCounterTransfersLauncher({
  payments,
  onSelect,
}: PendingCounterTransfersLauncherProps) {
  const [listOpen, setListOpen] = useState(false);
  const selectTimerRef = useRef<number | null>(null);
  const mode = getPendingTransferLaunchMode(payments.length);

  useEffect(() => () => {
    if (selectTimerRef.current !== null) window.clearTimeout(selectTimerRef.current);
  }, []);

  if (mode === "HIDDEN") return null;

  const handleOpen = (): void => {
    if (mode === "DIRECT") {
      onSelect(payments[0]);
      return;
    }
    setListOpen(true);
  };

  const handleSelect = (payment: StaffOrderResult): void => {
    setListOpen(false);
    if (selectTimerRef.current !== null) window.clearTimeout(selectTimerRef.current);
    selectTimerRef.current = window.setTimeout(() => {
      onSelect(payment);
      selectTimerRef.current = null;
    }, 250);
  };

  return (
    <>
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.18 }}
        onClick={handleOpen}
        aria-label={`Chờ chuyển khoản: ${payments.length} đơn`}
        className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <QrCode className="h-[18px] w-[18px]" aria-hidden="true" />
        <span className="text-sm font-semibold">Chờ CK</span>
        <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs font-bold">
          {payments.length}
        </span>
      </motion.button>

      <Drawer.Root open={listOpen} onOpenChange={setListOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[70] bg-black/45" />
          <Drawer.Content
            aria-labelledby="pending-transfer-list-title"
            className="fixed inset-x-0 bottom-0 z-[71] flex max-h-[85dvh] flex-col rounded-t-3xl bg-card shadow-2xl outline-none"
          >
            <div className="flex shrink-0 justify-center pb-1 pt-3">
              <div className="h-1.5 w-12 rounded-full bg-border" />
            </div>
            <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 pb-3 pt-2">
              <Drawer.Title id="pending-transfer-list-title" className="font-serif text-lg font-bold">
                Chọn đơn chuyển khoản
              </Drawer.Title>
              <button
                type="button"
                onClick={() => setListOpen(false)}
                aria-label="Đóng danh sách chuyển khoản"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {payments.map((payment) => (
                <motion.button
                  key={payment.id}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => handleSelect(payment)}
                  className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-bold text-foreground">
                      {payment.order_code}
                    </p>
                    {payment.auto_cancel_at && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                        <CountdownTimer targetTime={payment.auto_cancel_at} />
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-primary">
                      {formatKa(payment.grand_total_vnd, "ceil")}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-muted-foreground">Mở QR</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
