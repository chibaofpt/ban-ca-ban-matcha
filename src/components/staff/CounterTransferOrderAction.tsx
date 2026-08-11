"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CounterTransferPaymentModal } from "@/src/components/staff/CounterTransferPaymentModal";
import type { StaffOrderResult } from "@/src/lib/types/order";
import {
  toCounterTransferPayment,
  type CounterTransferOrderSummary,
} from "@/src/lib/utils/counterTransferOrder";

interface CounterTransferOrderActionProps {
  order: CounterTransferOrderSummary;
  isProcessing: boolean;
  onConfirm: (orderId: string) => Promise<void>;
  onCancel: (orderId: string) => Promise<void>;
  onUnavailable: () => void;
}

/** Render and own the payment modal for one pending counter-transfer list row. */
export function CounterTransferOrderAction({
  order,
  isProcessing,
  onConfirm,
  onCancel,
  onUnavailable,
}: CounterTransferOrderActionProps) {
  const [payment, setPayment] = useState<StaffOrderResult | null>(null);

  const openPayment = (): void => {
    const snapshot = toCounterTransferPayment(order);
    if (!snapshot) {
      onUnavailable();
      return;
    }
    setPayment(snapshot);
  };

  const runAction = async (action: (orderId: string) => Promise<void>): Promise<void> => {
    if (!payment) return;
    try {
      await action(payment.id);
      setPayment(null);
    } catch {
      // The view-owned mutation reports the API error and keeps this modal recoverable.
    }
  };

  return (
    <>
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.18 }}
        disabled={isProcessing}
        onClick={(event) => {
          event.stopPropagation();
          openPayment();
        }}
        className="min-h-11 w-full rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        Mở QR thanh toán
      </motion.button>
      <CounterTransferPaymentModal
        payment={payment}
        isProcessing={isProcessing}
        onConfirm={() => void runAction(onConfirm)}
        onCancel={() => void runAction(onCancel)}
        onClose={() => setPayment(null)}
      />
    </>
  );
}
