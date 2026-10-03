import type { DeliveryRecipientSnapshot, OrderStatus, OrderType } from "@/contracts/order";

interface Props extends DeliveryRecipientSnapshot {
  order_type: OrderType;
  status: OrderStatus;
  detail?: boolean;
}

/** Show the persisted delivery snapshot without falling back to current account data. */
export function DeliveryRecipientDetails({ order_type, status, detail = false, ...snapshot }: Props) {
  if (order_type !== "DELIVERY" || (!detail && (status === "COMPLETED" || status === "CANCELLED"))) return null;
  return <section className="space-y-1 rounded-xl border border-border bg-muted/40 p-3 text-sm" aria-label="Thông tin giao hàng">
    <p className="text-xs font-semibold text-muted-foreground">Người nhận · Giao hàng</p>
    <p className="font-semibold">{snapshot.delivery_receiver_name || "Chưa có tên người nhận"}</p>
    <p>{snapshot.delivery_receiver_phone || "Chưa có số điện thoại người nhận"}</p>
    <p className="break-words text-muted-foreground">{snapshot.delivery_address || "Chưa có địa chỉ giao hàng"}</p>
  </section>;
}
