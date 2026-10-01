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
  const money = (value: number) => `${value.toLocaleString("vi-VN")}đ`;
  return <ResponsiveOverlay open={open} onOpenChange={onOpenChange} title="Chi tiết đơn" size="md">
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono font-semibold">{order.order_code ?? `#${order.id.slice(0, 8)}`}</p>
        <span className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold">{statusLabels[order.status]}</span>
      </div>
      <PaymentMethodBadge method={resolveOrderPaymentMethod(order.order_type, order.payment_method)} />
      <OrderProgressBar status={order.status} />
      <DeliveryRecipientDetails {...order} detail />
      {children ?? <ul className="space-y-3">{order.items.map((item, index) => <li key={index} className="border-b border-border/50 pb-3">
        <div className="flex justify-between gap-2 text-sm font-semibold">
          <span>{item.menuItem.name} {item.size ? formatOrderSize(item.size) : "Add-on"} ×{item.quantity}</span>
          <span>{formatKa((item.unit_price_vnd + item.addons_price_vnd) * item.quantity, "ceil")}</span>
        </div>
        <OrderItemDetails item={item} />
      </li>)}</ul>}
      {!children && (order.discountVouchers?.length ?? 0) > 0 ? <p className="text-sm text-muted-foreground">Voucher đơn: {order.discountVouchers!.map((entry) => entry.voucher.package.name).join(", ")}</p> : null}
      <dl className="space-y-2 border-t border-border pt-3 text-sm">
        {[ ["Tạm tính", order.subtotal_vnd], ["Giảm voucher đơn", -order.total_voucher_discount_vnd],
          ["Phí giao hàng", order.shipping_fee_vnd], ["Giảm giao hàng", -order.freeship_discount_vnd],
          ["Tổng thanh toán", order.grand_total_vnd] ].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-semibold">{money(Number(value))}</dd></div>)}
      </dl>
    </div>
  </ResponsiveOverlay>;
}
