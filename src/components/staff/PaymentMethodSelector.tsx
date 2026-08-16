"use client";

import { Banknote, QrCode } from "lucide-react";
import type { PaymentMethod } from "@/src/lib/types/order";
import { cn } from "@/src/utils/cn";

interface PaymentMethodSelectorProps {
  value: PaymentMethod;
  bankTransferDisabled: boolean;
  onChange: (method: PaymentMethod) => void;
}

/** Accessible CASH/BANK_TRANSFER selector for staff counter checkout. */
export function PaymentMethodSelector({
  value,
  bankTransferDisabled,
  onChange,
}: PaymentMethodSelectorProps) {
  return (
    <fieldset aria-label="Phương thức thanh toán">
      <div className="grid grid-cols-2 gap-2">
        <label
          className={cn(
            "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring",
            value === "CASH" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card",
          )}
        >
          <input
            type="radio"
            name="payment-method"
            value="CASH"
            checked={value === "CASH"}
            onChange={() => onChange("CASH")}
            className="sr-only"
          />
          <Banknote className="h-4 w-4" aria-hidden="true" />
          Tiền mặt
        </label>
        <label
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring",
            bankTransferDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            value === "BANK_TRANSFER"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card",
          )}
        >
          <input
            type="radio"
            name="payment-method"
            value="BANK_TRANSFER"
            checked={value === "BANK_TRANSFER"}
            disabled={bankTransferDisabled}
            onChange={() => onChange("BANK_TRANSFER")}
            className="sr-only"
          />
          <QrCode className="h-4 w-4" aria-hidden="true" />
          Chuyển khoản
        </label>
      </div>
    </fieldset>
  );
}
