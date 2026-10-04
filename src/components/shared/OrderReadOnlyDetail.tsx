"use client";

import type { ReactNode } from "react";
import type { CustomerHistoryOrder, OrderListItem, OrderStatus } from "@/contracts/order";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import { DeliveryRecipientDetails } from "@/src/components/shared/DeliveryRecipientDetails";
import { OrderItemDetails } from "@/src/components/shared/OrderItemDetails";
import { PaymentMethodBadge } from "@/src/components/shared/PaymentMethodBadge";
import { OrderProgressBar } from "@/src/components/shared/OrderProgressBar";
import { formatKa, formatOrderSize } from "@/src/utils/display";
import { resolveOrderPaymentMethod } from "@/src/lib/utils/counterTransferOrder";

const statusLabels: Record<OrderStatus, string> = {
  PENDING: "Chờ thanh toán", ADMIN_CONFIRMED: "Đã xác nhận", STAFF_DONE: "Đã làm xong",
  COMPLETED: "Đã hoàn thành", CANCELLED: "Đã hủy",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: CustomerHistoryOrder | OrderListItem;
  children?: ReactNode;
}

/** Render one shared read-only order frame while callers retain operational and reorder actions. */
export function OrderReadOnlyDetail({ open, onOpenChange, order, children }: Props) {
  return <ResponsiveOverlay open={open} onOpenChange={onOpenChange} title="Chi tiết đơn" size="md">
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono font-semibold">{order.order_code ?? `#${order.id.slice(0, 8)}`}</p>
        <span className={order.status === "COMPLETED" ? "rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary" : "rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-foreground"}>{statusLabels[order.status]}</span>
      </div>
      <PaymentMethodBadge method={resolveOrderPaymentMethod(order.order_type, order.payment_method)} />
      <OrderProgressBar status={order.status} />
      <DeliveryRecipientDetails {...order} detail />
      {children ?? <ul className="space-y-3">{order.items.map((item, index) => {
        const itemPrice = item.unit_price_vnd + item.addons_price_vnd;
        const itemDiscount = item.total_discount_vnd ?? 0;
        return <li key={index} className="border-b border-border/50 pb-3">
          <div className="flex justify-between gap-2 text-sm font-semibold">
            <span>{item.menuItem.name} {item.size ? formatOrderSize(item.size) : "Add-on"} ×{item.quantity}</span>
            <span className="flex flex-col items-end leading-tight">
              {itemDiscount > 0 && <span className="text-xs font-light text-foreground line-through">{formatKa(itemPrice)}</span>}
              <span className={itemDiscount > 0 ? "font-bold text-foreground" : "font-semibold text-foreground"}>{formatKa(itemPrice - itemDiscount / item.quantity)}</span>
            </span>
          </div>
          <OrderItemDetails item={item} />
        </li>;
      })}</ul>}
      {!children && (order.discountVouchers?.length ?? 0) > 0 ? <p className="text-sm text-muted-foreground">Voucher đơn: {order.discountVouchers!.map((entry) => entry.voucher.package.name).join(", ")}</p> : null}
      <dl className="space-y-2 border-t border-border pt-3 text-sm">
        {[
          { label: "Tạm tính", value: order.subtotal_vnd, keepZero: true },
          { label: "Giảm voucher đơn", value: -order.total_voucher_discount_vnd, keepZero: false },
          { label: "Phí giao hàng", value: order.shipping_fee_vnd, keepZero: false },
          { label: "Giảm giao hàng", value: -order.freeship_discount_vnd, keepZero: false },
          { label: "Tổng thanh toán", value: order.grand_total_vnd, keepZero: true },
        ]
          .filter((row) => row.keepZero || Number(row.value) !== 0)
          .map(({ label, value }) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-semibold">{formatKa(Number(value))}</dd></div>)}
      </dl>
    </div>
  </ResponsiveOverlay>;
}
