"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { motion } from "framer-motion";
import { CountdownTimer } from "@/src/components/customer/CountdownTimer";
import { PaymentQrPanel } from "@/src/components/shared/PaymentQrPanel";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import type { StaffOrderResult } from "@/src/lib/types/order";

type CounterTransferPayment = Pick<
  StaffOrderResult,
  "id" | "order_code" | "auto_cancel_at" | "payment_qr_url" | "grand_total_vnd"
>;

interface CounterTransferPaymentModalProps {
  payment: CounterTransferPayment | null;
  isProcessing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Locked payment dialog for one pending counter bank transfer. */
export function CounterTransferPaymentModal({
  payment,
  isProcessing,
  onConfirm,
  onCancel,
}: CounterTransferPaymentModalProps) {
  const [confirmation, setConfirmation] = useState<"confirm" | "cancel" | null>(null);
  if (!payment || !payment.payment_qr_url || !payment.order_code || !payment.auto_cancel_at) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="counter-payment-title"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-h-[95vh] w-full max-w-md overflow-y-auto rounded-3xl bg-card p-4 shadow-2xl"
        >
          <div className="mb-3 text-center">
            <h2 id="counter-payment-title" className="font-serif text-xl font-bold">
              Chờ khách chuyển khoản
            </h2>
            <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <CountdownTimer targetTime={payment.auto_cancel_at} />
            </div>
          </div>

          <PaymentQrPanel
            qrUrl={payment.payment_qr_url}
            orderCode={payment.order_code}
            amountVnd={payment.grand_total_vnd}
          />

          <p className="mt-3 text-center text-xs text-muted-foreground">
            Chỉ xác nhận sau khi đã kiểm tra tiền vào tài khoản.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setConfirmation("cancel")}
              className="min-h-11 rounded-xl border border-destructive/30 px-3 text-sm font-semibold text-destructive disabled:opacity-50"
            >
              Huỷ giao dịch
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setConfirmation("confirm")}
              className="min-h-11 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {isProcessing ? "Đang xử lý…" : "Đã nhận tiền"}
            </button>
          </div>
        </motion.section>
      </div>

      <ConfirmModal
        isOpen={confirmation !== null}
        title={confirmation === "confirm" ? "Xác nhận đã nhận tiền" : "Huỷ giao dịch"}
        message={
          confirmation === "confirm"
            ? "Bạn đã kiểm tra và chắc chắn tiền đã vào tài khoản?"
            : "Đơn chờ sẽ bị huỷ và voucher được hoàn lại. Giỏ hàng vẫn được giữ nguyên."
        }
        confirmLabel={confirmation === "confirm" ? "Đã nhận tiền" : "Huỷ giao dịch"}
        cancelLabel="Quay lại"
        isDestructive={confirmation === "cancel"}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          const action = confirmation;
          setConfirmation(null);
          if (action === "confirm") onConfirm();
          if (action === "cancel") onCancel();
        }}
      />
    </>
  );
}
