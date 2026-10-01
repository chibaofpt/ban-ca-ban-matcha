import { Banknote, QrCode } from "lucide-react";
import type { PaymentMethod } from "@/src/lib/types/order";
import { cn } from "@/src/utils/cn";

interface PaymentMethodBadgeProps {
  method: PaymentMethod;
}

/** Compact audit badge for an order payment method. */
export function PaymentMethodBadge({ method }: PaymentMethodBadgeProps) {
  const isTransfer = method === "BANK_TRANSFER";
  const Icon = isTransfer ? QrCode : Banknote;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
        isTransfer ? "bg-primary/10 text-primary" : "bg-muted text-foreground",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {isTransfer ? "Chuyển khoản" : "Tiền mặt"}
    </span>
  );
}
